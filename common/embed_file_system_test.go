package common

import (
	"io"
	"net/http"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type closeTrackingFileSystem struct {
	http.FileSystem
	closed bool
}

func (f *closeTrackingFileSystem) Open(name string) (http.File, error) {
	file, err := f.FileSystem.Open(name)
	if err != nil {
		return nil, err
	}
	return &closeTrackingFile{File: file, onClose: func() { f.closed = true }}, nil
}

type closeTrackingFile struct {
	http.File
	onClose func()
}

func (f *closeTrackingFile) Close() error {
	f.onClose()
	return f.File.Close()
}

func TestEmbedFileSystemExistsClosesOpenedFile(t *testing.T) {
	trackingFS := &closeTrackingFileSystem{
		FileSystem: http.FS(fstest.MapFS{"file.txt": {Data: []byte("content")}}),
	}
	embeddedFS := &embedFileSystem{FileSystem: trackingFS}

	assert.True(t, embeddedFS.Exists("", "/file.txt"))
	assert.True(t, trackingFS.closed)
}

func TestEmbedFileSystemServesDirectoryIndexAsFile(t *testing.T) {
	embeddedFS := &embedFileSystem{
		FileSystem: http.FS(fstest.MapFS{"models/index.html": {Data: []byte("models-page")}}),
	}

	file, err := embeddedFS.Open("/models")
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, file.Close()) })
	info, err := file.Stat()
	require.NoError(t, err)
	assert.False(t, info.IsDir())
	content, err := io.ReadAll(file)
	require.NoError(t, err)
	assert.Equal(t, "models-page", string(content))
}

func TestEmbedFileSystemDoesNotExposeDirectoryWithoutLocaleIndex(t *testing.T) {
	embeddedFS := &embedFileSystem{
		FileSystem: http.FS(fstest.MapFS{"en/404/index.html": {Data: []byte("not-found")}}),
	}

	assert.False(t, embeddedFS.Exists("", "/en/"))
}

func TestEmbedFileSystemDoesNotExposeInternalOrUnreleasedApplications(t *testing.T) {
	embeddedFS := &embedFileSystem{
		FileSystem: http.FS(fstest.MapFS{
			"legacy/index.html":     {Data: []byte("legacy")},
			"admin/index.html":      {Data: []byte("admin")},
			"admin/assets/admin.js": {Data: []byte("admin-asset")},
		}),
	}

	for _, requestPath := range []string{
		"/legacy",
		"/legacy/index.html",
		"/admin",
		"/admin/index.html",
		"/admin/assets/admin.js",
	} {
		assert.False(t, embeddedFS.Exists("", requestPath), requestPath)
	}
}
