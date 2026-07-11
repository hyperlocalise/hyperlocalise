package main
import (
	"fmt"
	"path/filepath"
)
func main() {
	fmt.Printf("Ext('file.md '): %q\n", filepath.Ext("file.md "))
}
