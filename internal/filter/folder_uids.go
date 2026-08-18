package filter

// FolderUIDsFromProgram walks a compiled memo filter and returns every literal
// compared against the folder_uid field, in the order they appear. The empty
// string — the ungrouped sentinel — is included when present. Callers use this
// to reject filters that reference folders the caller does not own.
func FolderUIDsFromProgram(program *Program) []string {
	if program == nil {
		return nil
	}
	collector := &folderUIDCollector{}
	collector.walkCondition(program.ConditionTree())
	return collector.uids
}

type folderUIDCollector struct {
	uids []string
}

func (c *folderUIDCollector) walkCondition(cond Condition) {
	if cond == nil {
		return
	}
	switch typed := cond.(type) {
	case *LogicalCondition:
		c.walkCondition(typed.Left)
		c.walkCondition(typed.Right)
	case *NotCondition:
		c.walkCondition(typed.Expr)
	case *ComparisonCondition:
		if literal, ok := c.folderLiteral(typed.Left, typed.Right); ok {
			c.uids = append(c.uids, literal)
		} else if literal, ok := c.folderLiteral(typed.Right, typed.Left); ok {
			c.uids = append(c.uids, literal)
		}
	case *InCondition:
		if ref, ok := typed.Left.(*FieldRef); ok && ref.Name == "folder_uid" {
			for _, value := range typed.Values {
				if literal, ok := value.(*LiteralValue); ok {
					if s, ok := literal.Value.(string); ok {
						c.uids = append(c.uids, s)
					}
				}
			}
		}
	}
}

// folderLiteral returns the string literal on the opposite side of a
// folder_uid field reference, if this comparison is one.
func (*folderUIDCollector) folderLiteral(field ValueExpr, literal ValueExpr) (string, bool) {
	ref, ok := field.(*FieldRef)
	if !ok || ref.Name != "folder_uid" {
		return "", false
	}
	lit, ok := literal.(*LiteralValue)
	if !ok {
		return "", false
	}
	s, ok := lit.Value.(string)
	return s, ok
}
