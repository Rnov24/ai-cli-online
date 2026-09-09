package agyonline

import (
	"embed"
	"io/fs"
)

//go:embed all:web/dist
var WebDist embed.FS

func GetWebDistFS() (fs.FS, error) {
	return fs.Sub(WebDist, "web/dist")
}
