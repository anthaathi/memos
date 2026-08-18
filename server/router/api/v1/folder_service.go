package v1

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/usememos/memos/internal/filter"
	"github.com/usememos/memos/internal/util"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	"github.com/usememos/memos/store"
)

// FolderNamePrefix is the prefix of the folder resource name.
const FolderNamePrefix = "folders/"

// maxFolderTitleLength caps folder titles.
const maxFolderTitleLength = 64

// extractUserAndFolderIDFromName extracts the user and folder ID from a folder
// resource name. Format: users/{user}/folders/{folder}.
func (s *APIV1Service) extractUserAndFolderIDFromName(ctx context.Context, name string) (*store.User, string, error) {
	parts := strings.Split(name, "/")
	if len(parts) != 4 || parts[0] != "users" || parts[2] != "folders" {
		return nil, "", errors.Errorf("invalid folder name format: %s", name)
	}

	user, err := ResolveUserByName(ctx, s.Store, BuildUserName(parts[1]))
	if err != nil {
		return nil, "", err
	}
	if user == nil {
		return nil, "", errors.Errorf("user not found: %s", parts[1])
	}

	folderUID := parts[3]
	if folderUID == "" {
		return nil, "", errors.Errorf("empty folder ID in name: %s", name)
	}

	return user, folderUID, nil
}

// constructFolderName builds a folder resource name from its owner and UID.
func constructFolderName(username string, folderUID string) string {
	return BuildUserName(username) + "/" + FolderNamePrefix + folderUID
}

// validateFolderTitle validates a folder title and returns its trimmed form.
func validateFolderTitle(title string) (string, error) {
	trimmed := strings.TrimSpace(title)
	if trimmed == "" {
		return "", errors.New("title is required")
	}
	if utf8.RuneCountInString(trimmed) > maxFolderTitleLength {
		return "", errors.Errorf("title must be at most %d characters", maxFolderTitleLength)
	}
	return trimmed, nil
}

// authorizeFolderAccess asserts that the caller is the owner of the folder
// collection being accessed.
func (s *APIV1Service) authorizeFolderAccess(ctx context.Context, user *store.User) error {
	currentUser, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if currentUser == nil {
		return status.Errorf(codes.Unauthenticated, "user not authenticated")
	}
	if currentUser.ID != user.ID {
		return status.Errorf(codes.PermissionDenied, "permission denied")
	}
	return nil
}

func convertFolderFromStore(username string, folder *store.MemoFolder) *v1pb.Folder {
	return &v1pb.Folder{
		Name:       constructFolderName(username, folder.UID),
		Title:      folder.Title,
		Pinned:     folder.Pinned,
		CreateTime: timestamppb.New(time.Unix(folder.CreatedTs, 0)),
		UpdateTime: timestamppb.New(time.Unix(folder.UpdatedTs, 0)),
		MemoCount:  folder.MemoCount,
	}
}

// resolveFolderForUser resolves a folder resource name owned by the given user.
// It rejects malformed names, unknown folders, and folders owned by others.
func (s *APIV1Service) resolveFolderForUser(ctx context.Context, user *store.User, name string) (*store.MemoFolder, error) {
	if name == "" {
		return nil, status.Errorf(codes.InvalidArgument, "folder name is required")
	}
	owner, folderUID, err := s.extractUserAndFolderIDFromName(ctx, name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid folder name: %v", err)
	}
	if owner.ID != user.ID {
		return nil, status.Errorf(codes.PermissionDenied, "folder belongs to another user")
	}
	folder, err := s.Store.GetMemoFolder(ctx, &store.FindMemoFolder{UID: &folderUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get folder: %v", err)
	}
	if folder == nil {
		return nil, status.Errorf(codes.NotFound, "folder not found")
	}
	return folder, nil
}

// authorizeFolderUIDFilter rejects folder_uid filter predicates that reference
// folders not owned by the authenticated caller. The empty literal — the
// ungrouped sentinel — is always allowed.
func (s *APIV1Service) authorizeFolderUIDFilter(ctx context.Context, filterStr string) error {
	engine, err := filter.DefaultEngine()
	if err != nil {
		return status.Errorf(codes.Internal, "failed to get filter engine: %v", err)
	}
	program, err := engine.Compile(ctx, filterStr)
	if err != nil {
		return status.Errorf(codes.InvalidArgument, "invalid filter: %v", err)
	}
	uids := filter.FolderUIDsFromProgram(program)
	if len(uids) == 0 {
		return nil
	}

	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return status.Errorf(codes.Unauthenticated, "user not authenticated")
	}

	referenced := make([]string, 0, len(uids))
	for _, uid := range uids {
		if uid != "" {
			referenced = append(referenced, uid)
		}
	}
	if len(referenced) == 0 {
		return nil
	}
	folders, err := s.Store.ListMemoFolders(ctx, &store.FindMemoFolder{CreatorID: &user.ID, UIDList: referenced})
	if err != nil {
		return status.Errorf(codes.Internal, "failed to list folders: %v", err)
	}
	if len(folders) != len(referenced) {
		return status.Errorf(codes.PermissionDenied, "folder not found")
	}
	return nil
}

// ListFolders lists the folders owned by a user, plus the ungrouped memo count.
func (s *APIV1Service) ListFolders(ctx context.Context, request *v1pb.ListFoldersRequest) (*v1pb.ListFoldersResponse, error) {
	user, err := ResolveUserByName(ctx, s.Store, request.Parent)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user name: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.NotFound, "user not found")
	}
	if err := s.authorizeFolderAccess(ctx, user); err != nil {
		return nil, err
	}

	folders, err := s.Store.ListMemoFolders(ctx, &store.FindMemoFolder{CreatorID: &user.ID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list folders: %v", err)
	}
	counts, err := s.Store.CountMemosByFolder(ctx, user.ID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to count memos by folder: %v", err)
	}

	folderMessages := make([]*v1pb.Folder, 0, len(folders))
	for _, folder := range folders {
		if counts != nil {
			folder.MemoCount = counts.ByFolder[folder.ID]
		}
		folderMessages = append(folderMessages, convertFolderFromStore(user.Username, folder))
	}
	ungroupedCount := int32(0)
	if counts != nil {
		ungroupedCount = counts.Ungrouped
	}
	return &v1pb.ListFoldersResponse{
		Folders:            folderMessages,
		UngroupedMemoCount: ungroupedCount,
	}, nil
}

// GetFolder returns a folder owned by the caller.
func (s *APIV1Service) GetFolder(ctx context.Context, request *v1pb.GetFolderRequest) (*v1pb.Folder, error) {
	user, folderUID, err := s.extractUserAndFolderIDFromName(ctx, request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid folder name: %v", err)
	}
	if err := s.authorizeFolderAccess(ctx, user); err != nil {
		return nil, err
	}

	folder, err := s.Store.GetMemoFolder(ctx, &store.FindMemoFolder{UID: &folderUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get folder: %v", err)
	}
	if folder == nil {
		return nil, status.Errorf(codes.NotFound, "folder not found")
	}
	counts, err := s.Store.CountMemosByFolder(ctx, user.ID)
	if err == nil && counts != nil {
		folder.MemoCount = counts.ByFolder[folder.ID]
	}
	return convertFolderFromStore(user.Username, folder), nil
}

// CreateFolder creates a folder owned by the caller.
func (s *APIV1Service) CreateFolder(ctx context.Context, request *v1pb.CreateFolderRequest) (*v1pb.Folder, error) {
	user, err := ResolveUserByName(ctx, s.Store, request.Parent)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid user name: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.NotFound, "user not found")
	}
	if err := s.authorizeFolderAccess(ctx, user); err != nil {
		return nil, err
	}
	if request.Folder == nil {
		return nil, status.Errorf(codes.InvalidArgument, "folder is required")
	}

	title, err := validateFolderTitle(request.Folder.Title)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "%v", err)
	}
	newFolder := &store.MemoFolder{
		UID:       util.GenUUID(),
		CreatorID: user.ID,
		Title:     title,
		Pinned:    request.Folder.Pinned,
	}
	if request.ValidateOnly {
		newFolder.ID = 0
		return convertFolderFromStore(user.Username, newFolder), nil
	}

	folder, err := s.Store.CreateMemoFolder(ctx, newFolder)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create folder: %v", err)
	}
	return convertFolderFromStore(user.Username, folder), nil
}

// UpdateFolder updates the selected fields of a folder owned by the caller.
func (s *APIV1Service) UpdateFolder(ctx context.Context, request *v1pb.UpdateFolderRequest) (*v1pb.Folder, error) {
	user, folderUID, err := s.extractUserAndFolderIDFromName(ctx, request.GetFolder().GetName())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid folder name: %v", err)
	}
	if err := s.authorizeFolderAccess(ctx, user); err != nil {
		return nil, err
	}
	if request.UpdateMask == nil || len(request.UpdateMask.Paths) == 0 {
		return nil, status.Errorf(codes.InvalidArgument, "update mask is required")
	}

	folder, err := s.Store.GetMemoFolder(ctx, &store.FindMemoFolder{UID: &folderUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get folder: %v", err)
	}
	if folder == nil {
		return nil, status.Errorf(codes.NotFound, "folder not found")
	}

	update := &store.UpdateMemoFolder{ID: folder.ID}
	for _, field := range request.UpdateMask.Paths {
		switch field {
		case "title":
			title, err := validateFolderTitle(request.GetFolder().GetTitle())
			if err != nil {
				return nil, status.Errorf(codes.InvalidArgument, "%v", err)
			}
			update.Title = &title
		case "pinned":
			pinned := request.GetFolder().GetPinned()
			update.Pinned = &pinned
		default:
			return nil, status.Errorf(codes.InvalidArgument, "unsupported update mask path: %s", field)
		}
	}

	if err := s.Store.UpdateMemoFolder(ctx, update); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update folder: %v", err)
	}

	updated, err := s.Store.GetMemoFolder(ctx, &store.FindMemoFolder{ID: &folder.ID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get folder: %v", err)
	}
	if updated == nil {
		return nil, status.Errorf(codes.NotFound, "folder not found")
	}
	counts, err := s.Store.CountMemosByFolder(ctx, user.ID)
	if err == nil && counts != nil {
		updated.MemoCount = counts.ByFolder[updated.ID]
	}
	return convertFolderFromStore(user.Username, updated), nil
}

// DeleteFolder deletes a folder owned by the caller. Memos in the folder are
// moved to the ungrouped collection.
func (s *APIV1Service) DeleteFolder(ctx context.Context, request *v1pb.DeleteFolderRequest) (*emptypb.Empty, error) {
	user, folderUID, err := s.extractUserAndFolderIDFromName(ctx, request.Name)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid folder name: %v", err)
	}
	if err := s.authorizeFolderAccess(ctx, user); err != nil {
		return nil, err
	}

	folder, err := s.Store.GetMemoFolder(ctx, &store.FindMemoFolder{UID: &folderUID})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get folder: %v", err)
	}
	if folder == nil {
		return nil, status.Errorf(codes.NotFound, "folder not found")
	}
	if err := s.Store.DeleteMemoFolder(ctx, &store.DeleteMemoFolder{ID: folder.ID}); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete folder: %v", err)
	}
	return &emptypb.Empty{}, nil
}
