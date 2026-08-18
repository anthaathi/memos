package filter

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func compileForTest(t *testing.T, expr string) *Program {
	t.Helper()
	engine, err := DefaultEngine()
	require.NoError(t, err)
	program, err := engine.Compile(context.Background(), expr)
	require.NoError(t, err)
	return program
}

func TestFolderUIDsFromProgram(t *testing.T) {
	tests := []struct {
		name string
		expr string
		want []string
	}{
		{"equals", `folder_uid == "abc"`, []string{"abc"}},
		{"not equals", `folder_uid != "abc"`, []string{"abc"}},
		{"reversed operands", `"abc" == folder_uid`, []string{"abc"}},
		{"empty ungrouped sentinel", `folder_uid == ""`, []string{""}},
		{"in list", `folder_uid in ["a", "b"]`, []string{"a", "b"}},
		{"inside and", `pinned && folder_uid == "x"`, []string{"x"}},
		{"inside or", `folder_uid == "x" || folder_uid == "y"`, []string{"x", "y"}},
		{"inside not", `!(folder_uid == "x")`, []string{"x"}},
		{"other fields ignored", `content.contains("folder_uid") && pinned == true`, nil},
		{"literal in list of other field ignored", `visibility in ["PUBLIC", "PRIVATE"]`, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FolderUIDsFromProgram(compileForTest(t, tt.expr))
			require.Equal(t, tt.want, got)
		})
	}

	t.Run("nil program", func(t *testing.T) {
		require.Nil(t, FolderUIDsFromProgram(nil))
	})
}
