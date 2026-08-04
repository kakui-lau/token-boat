package router

import (
	"fmt"
	"os"
	"sort"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRelayOpenAPIContainsImplementedRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetRelayRouter(engine)
	SetVideoRouter(engine)

	specBytes, err := os.ReadFile("../docs/openapi/relay.json")
	require.NoError(t, err)
	var spec struct {
		Paths map[string]map[string]any `json:"paths"`
	}
	require.NoError(t, common.Unmarshal(specBytes, &spec))

	ignoredPrefixes := []string{"/pg/"}
	missing := make([]string, 0)
	for _, route := range engine.Routes() {
		ignored := false
		for _, prefix := range ignoredPrefixes {
			if strings.HasPrefix(route.Path, prefix) {
				ignored = true
				break
			}
		}
		if ignored || strings.Contains(route.Handler, "RelayNotImplemented") {
			continue
		}

		path := route.Path
		parts := strings.Split(path, "/")
		for i, part := range parts {
			if strings.HasPrefix(part, ":") {
				parts[i] = "{" + strings.TrimPrefix(part, ":") + "}"
			} else if strings.HasPrefix(part, "*") {
				parts[i] = "{" + strings.TrimPrefix(part, "*") + "}"
			}
		}
		path = strings.Join(parts, "/")
		if path == "/v1/models/{path}" {
			path = "/v1/models/{model}:generateContent"
		}
		if path == "/v1beta/models/{path}" {
			path = "/v1beta/models/{model}:generateContent"
		}
		operations, ok := spec.Paths[path]
		if !ok {
			missing = append(missing, route.Method+" "+path)
			continue
		}
		if _, ok := operations[strings.ToLower(route.Method)]; !ok {
			missing = append(missing, route.Method+" "+path)
		}
	}

	sort.Strings(missing)
	require.Empty(t, missing, "implemented public relay routes missing from docs/openapi/relay.json")
}

func TestRelayOpenAPIOperationContractsAreComplete(t *testing.T) {
	specBytes, err := os.ReadFile("../docs/openapi/relay.json")
	require.NoError(t, err)
	var spec map[string]any
	require.NoError(t, common.Unmarshal(specBytes, &spec))

	components, ok := spec["components"].(map[string]any)
	require.True(t, ok)
	schemas, ok := components["schemas"].(map[string]any)
	require.True(t, ok)
	paths, ok := spec["paths"].(map[string]any)
	require.True(t, ok)

	var walkRefs func(any)
	walkRefs = func(value any) {
		switch typed := value.(type) {
		case map[string]any:
			if refValue, exists := typed["$ref"]; exists {
				refString, refOK := refValue.(string)
				require.True(t, refOK)
				const schemaPrefix = "#/components/schemas/"
				require.True(t, strings.HasPrefix(refString, schemaPrefix), "unsupported OpenAPI reference %q", refString)
				_, exists = schemas[strings.TrimPrefix(refString, schemaPrefix)]
				require.True(t, exists, "unresolved OpenAPI reference %q", refString)
			}
			for _, nested := range typed {
				walkRefs(nested)
			}
		case []any:
			for _, nested := range typed {
				walkRefs(nested)
			}
		}
	}
	walkRefs(spec)

	httpMethods := map[string]bool{"get": true, "post": true, "put": true, "patch": true, "delete": true}
	for path, pathValue := range paths {
		pathItem, ok := pathValue.(map[string]any)
		require.True(t, ok, "path %s must contain an object", path)
		for method, operationValue := range pathItem {
			if !httpMethods[method] {
				continue
			}
			operation, ok := operationValue.(map[string]any)
			require.True(t, ok, "%s %s must contain an operation object", strings.ToUpper(method), path)
			responses, ok := operation["responses"].(map[string]any)
			require.True(t, ok, "%s %s must document responses", strings.ToUpper(method), path)
			hasSuccess := false
			for status := range responses {
				if strings.HasPrefix(status, "2") || status == "101" {
					hasSuccess = true
				}
			}
			require.True(t, hasSuccess, "%s %s must document a 2xx response", strings.ToUpper(method), path)

			parameters := make(map[string]bool)
			for _, owner := range []map[string]any{pathItem, operation} {
				values, _ := owner["parameters"].([]any)
				for _, value := range values {
					parameter, _ := value.(map[string]any)
					if parameter["in"] == "path" {
						parameters[fmt.Sprint(parameter["name"])] = parameter["required"] == true
					}
				}
			}
			for remainder := path; strings.Contains(remainder, "{"); {
				start := strings.Index(remainder, "{")
				end := strings.Index(remainder[start:], "}")
				require.Greater(t, end, 1, "invalid path template %s", path)
				name := remainder[start+1 : start+end]
				require.True(t, parameters[name], "%s %s must declare required path parameter %s", strings.ToUpper(method), path, name)
				remainder = remainder[start+end+1:]
			}
		}
	}
}
