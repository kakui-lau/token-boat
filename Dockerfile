FROM oven/bun:1@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 AS builder

WORKDIR /build/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY ./web ./
COPY ./VERSION /build/VERSION
RUN DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION=$(cat /build/VERSION) bun run build

FROM golang:1.26.1-alpine@sha256:2389ebfa5b7f43eeafbd6be0c3700cc46690ef842ad962f6c5bd6be49ed82039 AS builder2
ENV GO111MODULE=on CGO_ENABLED=0 GOWORK=off

ARG TARGETOS
ARG TARGETARCH
ENV GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64}
ENV GOEXPERIMENT=greenteagc

WORKDIR /build

ADD go.mod go.sum ./
# relaykit is a local submodule referenced via replace; its go.mod must be
# present for go mod download to resolve the main module graph.
ADD relaykit/go.mod ./relaykit/go.mod
RUN go mod download

COPY . .
COPY --from=builder /build/web/dist ./web/dist
RUN go build -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'" -o new-api \
    && mkdir -p /runtime-root/data /runtime-root/tmp \
	&& go build -ldflags "-s -w" -o /runtime-root/pricing-readiness ./cmd/local-pricing-bootstrap \
	&& go build -ldflags "-s -w" -o /runtime-root/db-migrate ./cmd/db-migrate

FROM gcr.m.daocloud.io/distroless/static-debian12:nonroot@sha256:f5b485ea962d9bd1186b2f6b3a061191539b905b82ec395de78cbfae51f20e35

COPY --from=builder2 --chown=65532:65532 /runtime-root/data /data
COPY --from=builder2 --chown=65532:65532 /runtime-root/tmp /tmp
COPY --from=builder2 --chown=65532:65532 /build/new-api /
COPY --from=builder2 --chown=65532:65532 /runtime-root/pricing-readiness /
COPY --from=builder2 --chown=65532:65532 /runtime-root/db-migrate /
COPY --chown=65532:65532 LICENSE NOTICE THIRD-PARTY-LICENSES.md /licenses/
EXPOSE 3000
WORKDIR /data
ENV HOME=/data TMPDIR=/tmp
USER 65532:65532
ENTRYPOINT ["/new-api"]
