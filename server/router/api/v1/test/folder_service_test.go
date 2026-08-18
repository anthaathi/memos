package test

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	apiv1 "github.com/usememos/memos/proto/gen/api/v1"
)

func createTestFolder(ctx context.Context, t *testing.T, ts *TestService, userCtx context.Context, userName, title string) *apiv1.Folder {
	t.Helper()
	folder, err := ts.Service.CreateFolder(userCtx, &apiv1.CreateFolderRequest{
		Parent: userName,
		Folder: &apiv1.Folder{Title: title},
	})
	require.NoError(t, err)
	require.NotEmpty(t, folder.Name)
	return folder
}

func TestFolderServiceCRUD(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "folder-user")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)
	userName := fmt.Sprintf("users/%s", user.Username)

	t.Run("create validates titles", func(t *testing.T) {
		_, err := ts.Service.CreateFolder(userCtx, &apiv1.CreateFolderRequest{Parent: userName, Folder: &apiv1.Folder{Title: "  "}})
		require.Error(t, err)
		require.Contains(t, err.Error(), "title is required")

		_, err = ts.Service.CreateFolder(userCtx, &apiv1.CreateFolderRequest{
			Parent: userName,
			Folder: &apiv1.Folder{Title: strings.Repeat("a", 65)},
		})
		require.Error(t, err)
		require.Contains(t, err.Error(), "at most 64")

		trimmed, err := ts.Service.CreateFolder(userCtx, &apiv1.CreateFolderRequest{
			Parent: userName,
			Folder: &apiv1.Folder{Title: "  Trimmed  "},
		})
		require.NoError(t, err)
		require.Equal(t, "Trimmed", trimmed.Title)
	})

	t.Run("create validate_only does not persist", func(t *testing.T) {
		resp, err := ts.Service.CreateFolder(userCtx, &apiv1.CreateFolderRequest{
			Parent:       userName,
			Folder:       &apiv1.Folder{Title: "Ghost"},
			ValidateOnly: true,
		})
		require.NoError(t, err)
		require.Equal(t, "Ghost", resp.Title)

		list, err := ts.Service.ListFolders(userCtx, &apiv1.ListFoldersRequest{Parent: userName})
		require.NoError(t, err)
		for _, folder := range list.Folders {
			require.NotEqual(t, "Ghost", folder.Title)
		}
	})

	t.Run("update title and pinned", func(t *testing.T) {
		folder := createTestFolder(ctx, t, ts, userCtx, userName, "Work")
		updated, err := ts.Service.UpdateFolder(userCtx, &apiv1.UpdateFolderRequest{
			Folder:     &apiv1.Folder{Name: folder.Name, Title: "Work 2026", Pinned: true},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"title", "pinned"}},
		})
		require.NoError(t, err)
		require.Equal(t, "Work 2026", updated.Title)
		require.True(t, updated.Pinned)

		_, err = ts.Service.UpdateFolder(userCtx, &apiv1.UpdateFolderRequest{
			Folder:     &apiv1.Folder{Name: folder.Name},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"bogus"}},
		})
		require.Error(t, err)
		require.Contains(t, err.Error(), "unsupported update mask path")
	})

	t.Run("get and delete", func(t *testing.T) {
		folder := createTestFolder(ctx, t, ts, userCtx, userName, "Temp")
		got, err := ts.Service.GetFolder(userCtx, &apiv1.GetFolderRequest{Name: folder.Name})
		require.NoError(t, err)
		require.Equal(t, folder.Name, got.Name)

		_, err = ts.Service.DeleteFolder(userCtx, &apiv1.DeleteFolderRequest{Name: folder.Name})
		require.NoError(t, err)

		_, err = ts.Service.GetFolder(userCtx, &apiv1.GetFolderRequest{Name: folder.Name})
		require.Error(t, err)
		require.Equal(t, codes.NotFound, status.Convert(err).Code())

		_, err = ts.Service.DeleteFolder(userCtx, &apiv1.DeleteFolderRequest{Name: folder.Name})
		require.Error(t, err)
		require.Equal(t, codes.NotFound, status.Convert(err).Code())
	})
}

func TestFolderServiceAuthorization(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "folder-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)
	ownerName := fmt.Sprintf("users/%s", owner.Username)

	other, err := ts.CreateRegularUser(ctx, "folder-other")
	require.NoError(t, err)
	otherCtx := ts.CreateUserContext(ctx, other.ID)

	folder := createTestFolder(ctx, t, ts, ownerCtx, ownerName, "Private stuff")

	t.Run("list requires ownership", func(t *testing.T) {
		_, err := ts.Service.ListFolders(otherCtx, &apiv1.ListFoldersRequest{Parent: ownerName})
		require.Error(t, err)
		require.Contains(t, err.Error(), "permission denied")

		_, err = ts.Service.ListFolders(ctx, &apiv1.ListFoldersRequest{Parent: ownerName})
		require.Error(t, err)
		require.Contains(t, err.Error(), "user not authenticated")
	})

	t.Run("get requires ownership", func(t *testing.T) {
		_, err := ts.Service.GetFolder(otherCtx, &apiv1.GetFolderRequest{Name: folder.Name})
		require.Error(t, err)
		require.Equal(t, codes.PermissionDenied, status.Convert(err).Code())
	})

	t.Run("update requires ownership", func(t *testing.T) {
		_, err := ts.Service.UpdateFolder(otherCtx, &apiv1.UpdateFolderRequest{
			Folder:     &apiv1.Folder{Name: folder.Name, Title: "Hijack"},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"title"}},
		})
		require.Error(t, err)
		require.Equal(t, codes.PermissionDenied, status.Convert(err).Code())
	})

	t.Run("delete requires ownership", func(t *testing.T) {
		_, err := ts.Service.DeleteFolder(otherCtx, &apiv1.DeleteFolderRequest{Name: folder.Name})
		require.Error(t, err)
		require.Equal(t, codes.PermissionDenied, status.Convert(err).Code())
	})

	t.Run("create rejects other parent", func(t *testing.T) {
		_, err := ts.Service.CreateFolder(otherCtx, &apiv1.CreateFolderRequest{
			Parent: ownerName,
			Folder: &apiv1.Folder{Title: "Not mine"},
		})
		require.Error(t, err)
		require.Equal(t, codes.PermissionDenied, status.Convert(err).Code())
	})
}

func TestFolderListOrderingAndCounts(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "folder-counts")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)
	userName := fmt.Sprintf("users/%s", user.Username)

	zFolder := createTestFolder(ctx, t, ts, userCtx, userName, "zebra")
	createTestFolder(ctx, t, ts, userCtx, userName, "apple")
	pinnedFolder := createTestFolder(ctx, t, ts, userCtx, userName, "middle")
	_, err = ts.Service.UpdateFolder(userCtx, &apiv1.UpdateFolderRequest{
		Folder:     &apiv1.Folder{Name: pinnedFolder.Name, Pinned: true},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"pinned"}},
	})
	require.NoError(t, err)

	// Two memos in zFolder, one ungrouped.
	for _, content := range []string{"z1", "z2"} {
		_, err = ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
			Memo: &apiv1.Memo{Content: content, Visibility: apiv1.Visibility_PRIVATE, Folder: zFolder.Name},
		})
		require.NoError(t, err)
	}
	_, err = ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "loose", Visibility: apiv1.Visibility_PRIVATE},
	})
	require.NoError(t, err)

	list, err := ts.Service.ListFolders(userCtx, &apiv1.ListFoldersRequest{Parent: userName})
	require.NoError(t, err)
	require.Len(t, list.Folders, 3)
	require.Equal(t, "middle", list.Folders[0].Title) // pinned first
	require.True(t, list.Folders[0].Pinned)
	require.Equal(t, "apple", list.Folders[1].Title)
	require.Equal(t, "zebra", list.Folders[2].Title)
	require.Equal(t, int32(2), list.Folders[2].MemoCount)
	require.Equal(t, int32(0), list.Folders[1].MemoCount)
	require.Equal(t, int32(1), list.UngroupedMemoCount)
}

func TestMemoFolderAssignmentAPI(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "folder-assign")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)
	userName := fmt.Sprintf("users/%s", user.Username)

	other, err := ts.CreateRegularUser(ctx, "folder-assign-other")
	require.NoError(t, err)
	otherCtx := ts.CreateUserContext(ctx, other.ID)
	otherName := fmt.Sprintf("users/%s", other.Username)
	otherFolder := createTestFolder(ctx, t, ts, otherCtx, otherName, "Other's folder")

	folder := createTestFolder(ctx, t, ts, userCtx, userName, "Work")

	t.Run("create memo in folder", func(t *testing.T) {
		memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
			Memo: &apiv1.Memo{Content: "in folder", Visibility: apiv1.Visibility_PRIVATE, Folder: folder.Name},
		})
		require.NoError(t, err)
		require.Equal(t, folder.Name, memo.Folder)
	})

	t.Run("create memo with foreign folder fails", func(t *testing.T) {
		_, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
			Memo: &apiv1.Memo{Content: "nope", Visibility: apiv1.Visibility_PRIVATE, Folder: otherFolder.Name},
		})
		require.Error(t, err)
		require.Equal(t, codes.PermissionDenied, status.Convert(err).Code())
	})

	t.Run("move and clear via UpdateMemo", func(t *testing.T) {
		memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
			Memo: &apiv1.Memo{Content: "move me", Visibility: apiv1.Visibility_PRIVATE},
		})
		require.NoError(t, err)
		require.Empty(t, memo.Folder)

		moved, err := ts.Service.UpdateMemo(userCtx, &apiv1.UpdateMemoRequest{
			Memo:       &apiv1.Memo{Name: memo.Name, Folder: folder.Name},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"folder"}},
		})
		require.NoError(t, err)
		require.Equal(t, folder.Name, moved.Folder)

		cleared, err := ts.Service.UpdateMemo(userCtx, &apiv1.UpdateMemoRequest{
			Memo:       &apiv1.Memo{Name: memo.Name, Folder: ""},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"folder"}},
		})
		require.NoError(t, err)
		require.Empty(t, cleared.Folder)

		_, err = ts.Service.UpdateMemo(userCtx, &apiv1.UpdateMemoRequest{
			Memo:       &apiv1.Memo{Name: memo.Name, Folder: otherFolder.Name},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"folder"}},
		})
		require.Error(t, err)
		require.Equal(t, codes.PermissionDenied, status.Convert(err).Code())
	})

	t.Run("folder field hidden from other users", func(t *testing.T) {
		memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
			Memo: &apiv1.Memo{Content: "public in folder", Visibility: apiv1.Visibility_PUBLIC, Folder: folder.Name},
		})
		require.NoError(t, err)

		asOwner, err := ts.Service.GetMemo(userCtx, &apiv1.GetMemoRequest{Name: memo.Name})
		require.NoError(t, err)
		require.Equal(t, folder.Name, asOwner.Folder)

		asOther, err := ts.Service.GetMemo(otherCtx, &apiv1.GetMemoRequest{Name: memo.Name})
		require.NoError(t, err)
		require.Empty(t, asOther.Folder)

		asAnonymous, err := ts.Service.GetMemo(ctx, &apiv1.GetMemoRequest{Name: memo.Name})
		require.NoError(t, err)
		require.Empty(t, asAnonymous.Folder)
	})

	t.Run("deleting folder ungroups memos", func(t *testing.T) {
		memo, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
			Memo: &apiv1.Memo{Content: "to ungroup", Visibility: apiv1.Visibility_PRIVATE, Folder: folder.Name},
		})
		require.NoError(t, err)

		_, err = ts.Service.DeleteFolder(userCtx, &apiv1.DeleteFolderRequest{Name: folder.Name})
		require.NoError(t, err)

		after, err := ts.Service.GetMemo(userCtx, &apiv1.GetMemoRequest{Name: memo.Name})
		require.NoError(t, err)
		require.Empty(t, after.Folder)

		list, err := ts.Service.ListMemos(userCtx, &apiv1.ListMemosRequest{Filter: `folder_uid == ""`})
		require.NoError(t, err)
		found := false
		for _, m := range list.Memos {
			if m.Name == memo.Name {
				found = true
			}
		}
		require.True(t, found, "memo should appear in the ungrouped feed after folder deletion")
	})
}

func TestListMemosFolderUIDFilter(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	user, err := ts.CreateRegularUser(ctx, "folder-filter")
	require.NoError(t, err)
	userCtx := ts.CreateUserContext(ctx, user.ID)
	userName := fmt.Sprintf("users/%s", user.Username)

	folder := createTestFolder(ctx, t, ts, userCtx, userName, "Filtered")
	inFolder, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "inside", Visibility: apiv1.Visibility_PRIVATE, Folder: folder.Name},
	})
	require.NoError(t, err)
	outside, err := ts.Service.CreateMemo(userCtx, &apiv1.CreateMemoRequest{
		Memo: &apiv1.Memo{Content: "outside", Visibility: apiv1.Visibility_PRIVATE},
	})
	require.NoError(t, err)

	folderUID := strings.TrimPrefix(folder.Name, userName+"/folders/")

	filtered, err := ts.Service.ListMemos(userCtx, &apiv1.ListMemosRequest{
		Filter: fmt.Sprintf(`creator == "users/%s" && folder_uid == %q`, user.Username, folderUID),
	})
	require.NoError(t, err)
	require.Len(t, filtered.Memos, 1)
	require.Equal(t, inFolder.Name, filtered.Memos[0].Name)

	ungrouped, err := ts.Service.ListMemos(userCtx, &apiv1.ListMemosRequest{
		Filter: fmt.Sprintf(`creator == "users/%s" && folder_uid == ""`, user.Username),
	})
	require.NoError(t, err)
	require.Len(t, ungrouped.Memos, 1)
	require.Equal(t, outside.Name, ungrouped.Memos[0].Name)
}

func TestListMemosFolderUIDFilterOwnership(t *testing.T) {
	ctx := context.Background()
	ts := NewTestService(t)
	defer ts.Cleanup()

	owner, err := ts.CreateRegularUser(ctx, "folder-filter-owner")
	require.NoError(t, err)
	ownerCtx := ts.CreateUserContext(ctx, owner.ID)
	ownerName := fmt.Sprintf("users/%s", owner.Username)
	secretFolder := createTestFolder(ctx, t, ts, ownerCtx, ownerName, "Secret")
	secretUID := strings.TrimPrefix(secretFolder.Name, ownerName+"/folders/")

	other, err := ts.CreateRegularUser(ctx, "folder-filter-spy")
	require.NoError(t, err)
	otherCtx := ts.CreateUserContext(ctx, other.ID)

	t.Run("owner may filter by their folder", func(t *testing.T) {
		_, err := ts.Service.ListMemos(ownerCtx, &apiv1.ListMemosRequest{
			Filter: fmt.Sprintf(`folder_uid == %q`, secretUID),
		})
		require.NoError(t, err)
	})

	t.Run("other users may not filter by a foreign folder", func(t *testing.T) {
		_, err := ts.Service.ListMemos(otherCtx, &apiv1.ListMemosRequest{
			Filter: fmt.Sprintf(`folder_uid == %q`, secretUID),
		})
		require.Error(t, err)
		require.Equal(t, codes.PermissionDenied, status.Convert(err).Code())
	})

	t.Run("the ungrouped sentinel is always allowed", func(t *testing.T) {
		_, err := ts.Service.ListMemos(otherCtx, &apiv1.ListMemosRequest{
			Filter: `folder_uid == ""`,
		})
		require.NoError(t, err)
	})

	t.Run("unknown folder UIDs are rejected for the owner too", func(t *testing.T) {
		_, err := ts.Service.ListMemos(ownerCtx, &apiv1.ListMemosRequest{
			Filter: `folder_uid == "does-not-exist"`,
		})
		require.Error(t, err)
		require.Equal(t, codes.PermissionDenied, status.Convert(err).Code())
	})

	t.Run("anonymous callers may not use folder filters", func(t *testing.T) {
		_, err := ts.Service.ListMemos(ctx, &apiv1.ListMemosRequest{
			Filter: `folder_uid == ""`,
		})
		require.Error(t, err)
		require.Equal(t, codes.Unauthenticated, status.Convert(err).Code())
	})
}
