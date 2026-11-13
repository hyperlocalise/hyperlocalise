package textextract

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"

	"github.com/klippa-app/go-pdfium"
	pdfiumerrors "github.com/klippa-app/go-pdfium/errors"
	"github.com/klippa-app/go-pdfium/requests"
	"github.com/klippa-app/go-pdfium/webassembly"
	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/experimental"
)

const (
	DefaultPDFWorkers = 2
	// 64 KiB WebAssembly pages; bounds each PDFium instance to 512 MiB.
	pdfiumMemoryLimitPages = 8192
)

// Compiling the embedded PDFium module is the expensive part of pool startup,
// so every extractor in the process shares the compiled code.
var pdfiumCompilationCache = wazero.NewCompilationCache()

// pdfEngine starts PDFium on first use and runs each document in a sandboxed
// WebAssembly instance with no filesystem access.
type pdfEngine struct {
	mu      sync.Mutex
	pool    pdfium.Pool
	workers int
	closed  bool
}

func (e *pdfEngine) instance(ctx context.Context) (pdfium.Pdfium, error) {
	e.mu.Lock()
	if e.closed {
		e.mu.Unlock()
		return nil, errors.New("extractor closed")
	}
	if e.pool == nil {
		pool, err := webassembly.Init(webassembly.Config{
			MinIdle:  0,
			MaxIdle:  e.workers,
			MaxTotal: e.workers,
			// A non-nil empty config replaces the library default of mounting "/".
			FSConfig: wazero.NewFSConfig(),
			RuntimeConfig: wazero.NewRuntimeConfig().
				WithCoreFeatures(api.CoreFeaturesV2 | experimental.CoreFeaturesExceptionHandling).
				WithCloseOnContextDone(true).
				WithMemoryLimitPages(pdfiumMemoryLimitPages).
				WithCompilationCache(pdfiumCompilationCache),
			Stdout: io.Discard,
			Stderr: io.Discard,
		})
		if err != nil {
			e.mu.Unlock()
			return nil, fmt.Errorf("start pdfium: %w", err)
		}
		e.pool = pool
	}
	pool := e.pool
	e.mu.Unlock()
	return pool.GetInstanceWithContext(ctx)
}

func (e *pdfEngine) close() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.closed = true
	if e.pool == nil {
		return nil
	}
	err := e.pool.Close()
	e.pool = nil
	return err
}

// extract reads the text layer. Cancelling ctx kills the instance, which also
// stops a pathological document that never finishes parsing. scanned is true
// when any page lacks meaningful native text.
func (e *pdfEngine) extract(ctx context.Context, data []byte, maxPages int) (text string, pages int, scanned bool, err error) {
	instance, err := e.instance(ctx)
	if err != nil {
		if ctx.Err() != nil {
			return "", 0, false, ctx.Err()
		}
		return "", 0, false, err
	}
	stopKill := context.AfterFunc(ctx, func() { _ = instance.Kill() })
	defer func() {
		if stopKill() {
			_ = instance.Close()
		}
		if ctx.Err() != nil {
			text, pages, scanned, err = "", 0, false, ctx.Err()
		}
	}()
	doc, err := instance.OpenDocument(&requests.OpenDocument{File: &data})
	if errors.Is(err, pdfiumerrors.ErrPassword) || errors.Is(err, pdfiumerrors.ErrSecurity) {
		return "", 0, false, ErrEncrypted
	}
	if err != nil {
		return "", 0, false, fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	defer func() { _, _ = instance.FPDF_CloseDocument(&requests.FPDF_CloseDocument{Document: doc.Document}) }()
	count, err := instance.FPDF_GetPageCount(&requests.FPDF_GetPageCount{Document: doc.Document})
	if err != nil {
		return "", 0, false, fmt.Errorf("%w: %v", ErrMalformed, err)
	}
	pages = count.PageCount
	if pages > maxPages {
		return "", pages, false, ErrTooLarge
	}
	var b strings.Builder
	for i := range pages {
		page, err := instance.GetPageText(&requests.GetPageText{Page: requests.Page{ByIndex: &requests.PageByIndex{Document: doc.Document, Index: i}}})
		if err != nil {
			return "", pages, false, fmt.Errorf("%w: page %d: %v", ErrMalformed, i+1, err)
		}
		if pageLacksMeaningfulText(page.Text) {
			scanned = true
		}
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString(page.Text)
	}
	return b.String(), pages, scanned, nil
}
