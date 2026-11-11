package translationfileparser

import (
	"context"
	"errors"
	"io"
	"sync"

	"github.com/klippa-app/go-pdfium"
	pdfiumerrors "github.com/klippa-app/go-pdfium/errors"
	"github.com/klippa-app/go-pdfium/webassembly"
	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/experimental"
)

const pdfiumMemoryLimitPages = 8192

var (
	pdfiumCompilationCache = wazero.NewCompilationCache()
	pdfiumPoolOnce         sync.Once
	pdfiumPool             pdfium.Pool
	pdfiumPoolErr          error
)

func sharedPDFiumPool() (pdfium.Pool, error) {
	pdfiumPoolOnce.Do(func() {
		pdfiumPool, pdfiumPoolErr = webassembly.Init(webassembly.Config{
			MinIdle:  0,
			MaxIdle:  2,
			MaxTotal: 2,
			FSConfig: wazero.NewFSConfig(),
			RuntimeConfig: wazero.NewRuntimeConfig().
				WithCoreFeatures(api.CoreFeaturesV2 | experimental.CoreFeaturesExceptionHandling).
				WithCloseOnContextDone(true).
				WithMemoryLimitPages(pdfiumMemoryLimitPages).
				WithCompilationCache(pdfiumCompilationCache),
			Stdout: io.Discard,
			Stderr: io.Discard,
		})
	})
	return pdfiumPool, pdfiumPoolErr
}

func withPDFiumInstance(ctx context.Context, fn func(pdfium.Pdfium) error) error {
	pool, err := sharedPDFiumPool()
	if err != nil {
		return err
	}
	instance, err := pool.GetInstanceWithContext(ctx)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return err
	}
	stopKill := context.AfterFunc(ctx, func() { _ = instance.Kill() })
	defer func() {
		if stopKill() {
			_ = instance.Close()
		}
	}()
	return fn(instance)
}

func mapPDFiumOpenError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pdfiumerrors.ErrPassword) || errors.Is(err, pdfiumerrors.ErrSecurity) {
		return ErrPDFEncrypted
	}
	return ErrPDFMalformed
}
