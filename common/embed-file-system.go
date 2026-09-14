package common

import (
	"io/fs"
	"net/http"
	"os"
	"strings"

	"github.com/gin-contrib/static"
)

// Credit: https://github.com/gin-contrib/static/issues/19

type embedFileSystem struct {
	http.FileSystem
}

func (e *embedFileSystem) Exists(prefix string, path string) bool {
	file, err := e.Open(path)
	if err != nil {
		return false
	}
	_ = file.Close()
	return true
}

func (e *embedFileSystem) Open(name string) (http.File, error) {
	internalPath := strings.TrimSuffix(name, "/")
	if name == "/" || internalPath == "/legacy" || strings.HasPrefix(internalPath, "/legacy/") ||
		internalPath == "/admin" || strings.HasPrefix(internalPath, "/admin/") ||
		internalPath == "/404.html" || internalPath == "/en/404" ||
		internalPath == "/ja/404" || internalPath == "/ko/404" || internalPath == "/zh-TW/404" ||
		strings.HasSuffix(internalPath, "/404/index.html") {
		// The root document is served by the web router so runtime analytics and
		// explicit cache policy still apply. Compatibility and 404 documents are
		// internal templates that the router serves only with the correct status.
		return nil, os.ErrNotExist
	}

	openName := internalPath
	file, err := e.FileSystem.Open(openName)
	if err != nil {
		return nil, err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, err
	}
	if !info.IsDir() {
		return file, nil
	}
	directoryPath := openName
	switch directoryPath {
	case "/en", "/ja", "/ko", "/zh-TW":
		indexFile, indexErr := e.FileSystem.Open(directoryPath + "/index.html")
		if indexErr != nil {
			_ = file.Close()
			return nil, indexErr
		}
		_ = indexFile.Close()
		return file, nil
	}

	_ = file.Close()
	indexPath := directoryPath + "/index.html"
	return e.FileSystem.Open(indexPath)
}

func EmbedFolder(fsEmbed fs.FS, targetPath string) static.ServeFileSystem {
	efs, err := fs.Sub(fsEmbed, targetPath)
	if err != nil {
		panic(err)
	}
	return &embedFileSystem{
		FileSystem: http.FS(efs),
	}
}
