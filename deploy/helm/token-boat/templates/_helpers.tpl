{{- define "token-boat.name" -}}
token-boat
{{- end }}

{{- define "token-boat.fullname" -}}
{{- printf "%s" (include "token-boat.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "token-boat.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "token-boat.labels" -}}
helm.sh/chart: {{ include "token-boat.chart" . }}
app.kubernetes.io/name: {{ include "token-boat.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "token-boat.selectorLabels" -}}
app.kubernetes.io/name: {{ include "token-boat.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "token-boat.image" -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- end }}

{{- define "token-boat.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "token-boat.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- required "serviceAccount.name is required when serviceAccount.create=false" .Values.serviceAccount.name -}}
{{- end -}}
{{- end }}
