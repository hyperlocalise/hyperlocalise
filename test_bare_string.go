package main
import (
	"fmt"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
)
func main() {
	req := segmentvalidate.Request{
		SourceText: " Hello ",
		TargetText: "Bonjour",
		SourcePath: "test.json",
	}
	checks := segmentvalidate.ValidateSegment(req)
	for _, c := range checks {
		fmt.Printf("ID: %s, Status: %s, Message: %s\n", c.ID, c.Status, c.Message)
	}
}
