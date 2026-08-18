package sqlite

import (
	"context"
	"strings"

	"github.com/pkg/errors"

	"github.com/usememos/memos/store"
)

func (d *DB) CreateMemoFolder(ctx context.Context, create *store.MemoFolder) (*store.MemoFolder, error) {
	stmt := `
		INSERT INTO memo_folder (uid, creator_id, title, pinned)
		VALUES (?, ?, ?, ?)
		RETURNING id, created_ts, updated_ts
	`
	if err := d.db.QueryRowContext(
		ctx,
		stmt,
		create.UID,
		create.CreatorID,
		create.Title,
		create.Pinned,
	).Scan(
		&create.ID,
		&create.CreatedTs,
		&create.UpdatedTs,
	); err != nil {
		return nil, err
	}
	return create, nil
}

func (d *DB) ListMemoFolders(ctx context.Context, find *store.FindMemoFolder) ([]*store.MemoFolder, error) {
	where, args := []string{"1 = 1"}, []any{}
	if v := find.ID; v != nil {
		where, args = append(where, "id = ?"), append(args, *v)
	}
	if v := find.UID; v != nil {
		where, args = append(where, "uid = ?"), append(args, *v)
	}
	if len(find.UIDList) > 0 {
		placeholders := make([]string, 0, len(find.UIDList))
		for _, uid := range find.UIDList {
			placeholders = append(placeholders, "?")
			args = append(args, uid)
		}
		where = append(where, "`uid` IN ("+strings.Join(placeholders, ",")+")")
	}
	if len(find.IDList) > 0 {
		placeholders := make([]string, 0, len(find.IDList))
		for _, id := range find.IDList {
			placeholders = append(placeholders, "?")
			args = append(args, id)
		}
		where = append(where, "id IN ("+strings.Join(placeholders, ",")+")")
	}
	if v := find.CreatorID; v != nil {
		where, args = append(where, "creator_id = ?"), append(args, *v)
	}

	query := `
		SELECT id, uid, creator_id, created_ts, updated_ts, title, pinned
		FROM memo_folder
		WHERE ` + strings.Join(where, " AND ") + `
		ORDER BY pinned DESC, LOWER(title) ASC, id ASC
	`
	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]*store.MemoFolder, 0)
	for rows.Next() {
		folder := &store.MemoFolder{}
		if err := rows.Scan(
			&folder.ID,
			&folder.UID,
			&folder.CreatorID,
			&folder.CreatedTs,
			&folder.UpdatedTs,
			&folder.Title,
			&folder.Pinned,
		); err != nil {
			return nil, err
		}
		list = append(list, folder)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (d *DB) UpdateMemoFolder(ctx context.Context, update *store.UpdateMemoFolder) error {
	set, args := []string{}, []any{}
	if v := update.Title; v != nil {
		set, args = append(set, "title = ?"), append(args, *v)
	}
	if v := update.Pinned; v != nil {
		set, args = append(set, "pinned = ?"), append(args, *v)
	}
	if v := update.UpdatedTs; v != nil {
		set, args = append(set, "updated_ts = ?"), append(args, *v)
	}
	if len(set) == 0 {
		return nil
	}
	args = append(args, update.ID)
	stmt := "UPDATE memo_folder SET " + strings.Join(set, ", ") + " WHERE id = ?"
	result, err := d.db.ExecContext(ctx, stmt, args...)
	if err != nil {
		return errors.Wrap(err, "failed to update memo folder")
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("memo folder not found")
	}
	return nil
}

func (d *DB) DeleteMemoFolder(ctx context.Context, delete *store.DeleteMemoFolder) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return errors.Wrap(err, "failed to begin delete memo folder transaction")
	}
	defer func() {
		_ = tx.Rollback()
	}()

	// Detach memos from the folder first; they stay as ungrouped memos.
	if _, err := tx.ExecContext(ctx, "UPDATE memo SET folder_id = 0 WHERE folder_id = ?", delete.ID); err != nil {
		return errors.Wrap(err, "failed to detach memos from folder")
	}
	result, err := tx.ExecContext(ctx, "DELETE FROM memo_folder WHERE id = ?", delete.ID)
	if err != nil {
		return errors.Wrap(err, "failed to delete memo folder")
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("memo folder not found")
	}
	return tx.Commit()
}

func (d *DB) CountMemosByFolder(ctx context.Context, creatorID int32) (*store.MemoFolderCounts, error) {
	query := `
		SELECT memo.folder_id, COUNT(*)
		FROM memo
		WHERE memo.creator_id = ?
			AND memo.row_status = 'NORMAL'
			AND NOT EXISTS (
				SELECT 1 FROM memo_relation WHERE memo_relation.memo_id = memo.id AND memo_relation.type = 'COMMENT'
			)
		GROUP BY memo.folder_id
	`
	rows, err := d.db.QueryContext(ctx, query, creatorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := &store.MemoFolderCounts{ByFolder: make(map[int32]int32)}
	for rows.Next() {
		var folderID int32
		var count int32
		if err := rows.Scan(&folderID, &count); err != nil {
			return nil, err
		}
		if folderID == 0 {
			counts.Ungrouped = count
		} else {
			counts.ByFolder[folderID] = count
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return counts, nil
}
