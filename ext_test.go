package main
import (
	"fmt"
	"path/filepath"
)
func main() {
	fmt.Printf("'.md': %q\n", filepath.Ext(".md"))
	fmt.Printf("'file.md ': %q\n", filepath.Ext("file.md "))
}
