package store

import (
	"context"
	"errors"

	"github.com/usememos/memos/internal/base"
)

// MemoFolder is a user-owned folder that groups memos. A memo belongs to at
// most one folder; memos without a folder are ungrouped.
type MemoFolder struct {
	// ID is the system generated unique identifier for the folder.
	ID int32
	// UID is the system generated unique identifier exposed in the API.
	UID string

	// Standard fields
	CreatorID int32
	CreatedTs int64
	UpdatedTs int64

	// Domain specific fields
	Title     string
	Pinned    bool
	MemoCount int32
}

type FindMemoFolder struct {
	ID     *int32
	UID    *string
	IDList []int32

	// Standard fields
	CreatorID *int32

	// UIDList matches any of the listed folder UIDs.
	UIDList []string
}

type UpdateMemoFolder struct {
	ID        int32
	Title     *string
	Pinned    *bool
	UpdatedTs *int64
}

type DeleteMemoFolder struct {
	ID int32
}

// MemoFolderCounts groups memo counts by folder for one creator.
type MemoFolderCounts struct {
	// ByFolder maps folder IDs to the number of normal memos in the folder.
	ByFolder map[int32]int32
	// Ungrouped is the number of normal memos without a folder.
	Ungrouped int32
}

// CreateMemoFolder creates a folder.
func (s *Store) CreateMemoFolder(ctx context.Context, create *MemoFolder) (*MemoFolder, error) {
	if !base.UIDMatcher.MatchString(create.UID) {
		return nil, errors.New("invalid uid")
	}
	return s.driver.CreateMemoFolder(ctx, create)
}

// ListMemoFolders lists folders matching the find filters.
func (s *Store) ListMemoFolders(ctx context.Context, find *FindMemoFolder) ([]*MemoFolder, error) {
	return s.driver.ListMemoFolders(ctx, find)
}

// GetMemoFolder returns the first folder matching the find filters, or nil.
func (s *Store) GetMemoFolder(ctx context.Context, find *FindMemoFolder) (*MemoFolder, error) {
	list, err := s.ListMemoFolders(ctx, find)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, nil
	}
	return list[0], nil
}

// UpdateMemoFolder updates the selected fields of a folder.
func (s *Store) UpdateMemoFolder(ctx context.Context, update *UpdateMemoFolder) error {
	return s.driver.UpdateMemoFolder(ctx, update)
}

// DeleteMemoFolder deletes a folder. Memos in the folder are moved to the
// ungrouped collection instead of being deleted.
func (s *Store) DeleteMemoFolder(ctx context.Context, delete *DeleteMemoFolder) error {
	return s.driver.DeleteMemoFolder(ctx, delete)
}

// CountMemosByFolder counts normal memos per folder for the creator, plus the
// number of ungrouped normal memos. Comment memos are excluded.
func (s *Store) CountMemosByFolder(ctx context.Context, creatorID int32) (*MemoFolderCounts, error) {
	return s.driver.CountMemosByFolder(ctx, creatorID)
}
