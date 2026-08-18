package test

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/usememos/memos/store"
)

func createTestingMemoFolder(ctx context.Context, ts *store.Store, user *store.User, uid, title string, pinned bool) (*store.MemoFolder, error) {
	return ts.CreateMemoFolder(ctx, &store.MemoFolder{
		UID:       uid,
		CreatorID: user.ID,
		Title:     title,
		Pinned:    pinned,
	})
}

func createTestingMemoInFolder(ctx context.Context, ts *store.Store, user *store.User, uid string, folderID int32) (*store.Memo, error) {
	return ts.CreateMemo(ctx, &store.Memo{
		UID:        uid,
		CreatorID:  user.ID,
		Content:    "folder test content " + uid,
		Visibility: store.Private,
		FolderID:   folderID,
	})
}

func TestMemoFolderCRUD(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	folder, err := createTestingMemoFolder(ctx, ts, user, "folder-crud-uid", "Work", false)
	require.NoError(t, err)
	require.NotZero(t, folder.ID)
	require.Equal(t, "Work", folder.Title)
	require.False(t, folder.Pinned)

	// Fetch by UID.
	found, err := ts.GetMemoFolder(ctx, &store.FindMemoFolder{UID: &folder.UID})
	require.NoError(t, err)
	require.NotNil(t, found)
	require.Equal(t, folder.ID, found.ID)

	// Rename and pin.
	newTitle := "Work 2026"
	pinned := true
	err = ts.UpdateMemoFolder(ctx, &store.UpdateMemoFolder{ID: folder.ID, Title: &newTitle, Pinned: &pinned})
	require.NoError(t, err)
	found, err = ts.GetMemoFolder(ctx, &store.FindMemoFolder{ID: &folder.ID})
	require.NoError(t, err)
	require.Equal(t, newTitle, found.Title)
	require.True(t, found.Pinned)

	// Updating a missing folder fails.
	err = ts.UpdateMemoFolder(ctx, &store.UpdateMemoFolder{ID: folder.ID + 1000, Title: &newTitle})
	require.Error(t, err)

	// Deleting a missing folder fails.
	err = ts.DeleteMemoFolder(ctx, &store.DeleteMemoFolder{ID: folder.ID + 1000})
	require.Error(t, err)

	err = ts.DeleteMemoFolder(ctx, &store.DeleteMemoFolder{ID: folder.ID})
	require.NoError(t, err)
	found, err = ts.GetMemoFolder(ctx, &store.FindMemoFolder{ID: &folder.ID})
	require.NoError(t, err)
	require.Nil(t, found)
	ts.Close()
}

func TestMemoFolderListOrdering(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	_, err = createTestingMemoFolder(ctx, ts, user, "folder-alpha", "zebra", false)
	require.NoError(t, err)
	pinned := true
	beta, err := ts.CreateMemoFolder(ctx, &store.MemoFolder{UID: "folder-beta", CreatorID: user.ID, Title: "pinned b", Pinned: pinned})
	require.NoError(t, err)
	_, err = createTestingMemoFolder(ctx, ts, user, "folder-gamma", "apple", false)
	require.NoError(t, err)
	// Same-pinned folder sorts by title after beta.
	_, err = ts.CreateMemoFolder(ctx, &store.MemoFolder{UID: "folder-delta", CreatorID: user.ID, Title: "pinned a", Pinned: pinned})
	require.NoError(t, err)

	folders, err := ts.ListMemoFolders(ctx, &store.FindMemoFolder{CreatorID: &user.ID})
	require.NoError(t, err)
	require.Len(t, folders, 4)
	require.Equal(t, "pinned a", folders[0].Title)
	require.Equal(t, "pinned b", folders[1].Title)
	require.Equal(t, "apple", folders[2].Title)
	require.Equal(t, "zebra", folders[3].Title)
	require.Equal(t, beta.ID, folders[1].ID)
	ts.Close()
}

func TestMemoFolderOwnershipIsolation(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	owner, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)
	other, err := createTestingUserWithRole(ctx, ts, "folder-other-user", store.RoleUser)
	require.NoError(t, err)

	ownerFolder, err := createTestingMemoFolder(ctx, ts, owner, "folder-owner-uid", "Owner folder", false)
	require.NoError(t, err)

	// Listing by creator only returns the owner's folders.
	folders, err := ts.ListMemoFolders(ctx, &store.FindMemoFolder{CreatorID: &other.ID})
	require.NoError(t, err)
	require.Empty(t, folders)

	// A memo of another user cannot be filed into the owner's folder through
	// the store layer's plain update, but list filters must stay scoped by
	// creator anyway.
	memo, err := createTestingMemoInFolder(ctx, ts, other, "folder-other-memo", ownerFolder.ID)
	require.NoError(t, err)
	require.Equal(t, ownerFolder.ID, memo.FolderID)

	// Owner counts ignore the other user's memo.
	counts, err := ts.CountMemosByFolder(ctx, owner.ID)
	require.NoError(t, err)
	require.Equal(t, int32(0), counts.ByFolder[ownerFolder.ID])
	require.Equal(t, int32(0), counts.Ungrouped)

	counts, err = ts.CountMemosByFolder(ctx, other.ID)
	require.NoError(t, err)
	require.Equal(t, int32(1), counts.ByFolder[ownerFolder.ID])
	require.Equal(t, int32(0), counts.Ungrouped)
	ts.Close()
}

func TestMemoFolderAssignmentLifecycle(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	folder, err := createTestingMemoFolder(ctx, ts, user, "folder-lifecycle", "Projects", false)
	require.NoError(t, err)

	// Create a memo directly in the folder.
	memo, err := createTestingMemoInFolder(ctx, ts, user, "folder-memo-in-folder", folder.ID)
	require.NoError(t, err)
	require.Equal(t, folder.ID, memo.FolderID)

	// Create an ungrouped memo.
	ungrouped, err := createTestingMemoInFolder(ctx, ts, user, "folder-memo-ungrouped", 0)
	require.NoError(t, err)
	require.Equal(t, int32(0), ungrouped.FolderID)

	// Reads carry folder_id.
	loaded, err := ts.GetMemo(ctx, &store.FindMemo{ID: &memo.ID})
	require.NoError(t, err)
	require.Equal(t, folder.ID, loaded.FolderID)

	// Move the ungrouped memo into the folder via UpdateMemo.
	target := folder.ID
	err = ts.UpdateMemo(ctx, &store.UpdateMemo{ID: ungrouped.ID, FolderID: &target})
	require.NoError(t, err)
	loaded, err = ts.GetMemo(ctx, &store.FindMemo{ID: &ungrouped.ID})
	require.NoError(t, err)
	require.Equal(t, folder.ID, loaded.FolderID)

	// Clear the folder assignment.
	zero := int32(0)
	err = ts.UpdateMemo(ctx, &store.UpdateMemo{ID: ungrouped.ID, FolderID: &zero})
	require.NoError(t, err)
	loaded, err = ts.GetMemo(ctx, &store.FindMemo{ID: &ungrouped.ID})
	require.NoError(t, err)
	require.Equal(t, int32(0), loaded.FolderID)

	// Counts reflect both memos: one foldered, one ungrouped.
	counts, err := ts.CountMemosByFolder(ctx, user.ID)
	require.NoError(t, err)
	require.Equal(t, int32(1), counts.ByFolder[folder.ID])
	require.Equal(t, int32(1), counts.Ungrouped)
	ts.Close()
}

func TestMemoFolderDeleteMovesMemosToUngrouped(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	folder, err := createTestingMemoFolder(ctx, ts, user, "folder-delete", "To delete", false)
	require.NoError(t, err)
	memo, err := createTestingMemoInFolder(ctx, ts, user, "folder-delete-memo", folder.ID)
	require.NoError(t, err)

	err = ts.DeleteMemoFolder(ctx, &store.DeleteMemoFolder{ID: folder.ID})
	require.NoError(t, err)

	// The memo survives and becomes ungrouped.
	loaded, err := ts.GetMemo(ctx, &store.FindMemo{ID: &memo.ID})
	require.NoError(t, err)
	require.NotNil(t, loaded)
	require.Equal(t, int32(0), loaded.FolderID)

	counts, err := ts.CountMemosByFolder(ctx, user.ID)
	require.NoError(t, err)
	require.Equal(t, int32(1), counts.Ungrouped)
	require.Empty(t, counts.ByFolder)
	ts.Close()
}

func TestMemoFolderCELFilter(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	ts := NewTestingStore(ctx, t)
	user, err := createTestingHostUser(ctx, ts)
	require.NoError(t, err)

	folder, err := createTestingMemoFolder(ctx, ts, user, "folder-cel", "CEL", false)
	require.NoError(t, err)
	foldered, err := createTestingMemoInFolder(ctx, ts, user, "folder-cel-in", folder.ID)
	require.NoError(t, err)
	ungrouped, err := createTestingMemoInFolder(ctx, ts, user, "folder-cel-out", 0)
	require.NoError(t, err)

	listByFolder, err := ts.ListMemos(ctx, &store.FindMemo{
		CreatorID: &user.ID,
		Filters:   []string{fmt.Sprintf("folder_uid == %q", folder.UID)},
	})
	require.NoError(t, err)
	require.Len(t, listByFolder, 1)
	require.Equal(t, foldered.ID, listByFolder[0].ID)

	listUngrouped, err := ts.ListMemos(ctx, &store.FindMemo{
		CreatorID: &user.ID,
		Filters:   []string{`folder_uid == ""`},
	})
	require.NoError(t, err)
	require.Len(t, listUngrouped, 1)
	require.Equal(t, ungrouped.ID, listUngrouped[0].ID)

	listEither, err := ts.ListMemos(ctx, &store.FindMemo{
		CreatorID: &user.ID,
		Filters:   []string{fmt.Sprintf(`folder_uid != %q`, folder.UID)},
	})
	require.NoError(t, err)
	require.Len(t, listEither, 1)
	require.Equal(t, ungrouped.ID, listEither[0].ID)
	ts.Close()
}
