import * as monaco from "monaco-editor";
import type { EngineDiagnostic } from "./eslint-engine";

// True module scope (a .ts module, unlike a Vue <script setup> block which runs per-instance):
// the provider is registered exactly once per page and reads per-model diagnostics, so multiple
// editor instances neither duplicate the registration nor clobber each other's diagnostics.
const diagnosticsByModel = new WeakMap<monaco.editor.ITextModel, EngineDiagnostic[]>();
let registered = false;

export function setModelDiagnostics(
  model: monaco.editor.ITextModel,
  diagnostics: EngineDiagnostic[],
): void {
  diagnosticsByModel.set(model, diagnostics);
}

export function registerSafeqlQuickFix(): void {
  if (registered) {
    return;
  }
  registered = true;

  monaco.languages.registerCodeActionProvider("typescript", {
    provideCodeActions(model, _range, context) {
      const tsDiagnostics = diagnosticsByModel.get(model) ?? [];
      const actions = context.markers.flatMap((marker) => {
        const diagnostic = tsDiagnostics.find(
          (entry) =>
            entry.fix !== undefined &&
            entry.message === marker.message &&
            entry.line === marker.startLineNumber &&
            entry.column === marker.startColumn,
        );
        if (diagnostic?.fix === undefined) {
          return [];
        }

        const start = model.getPositionAt(diagnostic.fix.from);
        const end = model.getPositionAt(diagnostic.fix.to);
        return [
          {
            title: "SafeQL: apply suggested type annotation",
            kind: "quickfix",
            diagnostics: [marker],
            isPreferred: true,
            edit: {
              edits: [
                {
                  resource: model.uri,
                  versionId: model.getVersionId(),
                  textEdit: {
                    range: new monaco.Range(
                      start.lineNumber,
                      start.column,
                      end.lineNumber,
                      end.column,
                    ),
                    text: diagnostic.fix.text,
                  },
                },
              ],
            },
          },
        ];
      });

      return { actions, dispose: () => undefined };
    },
  });
}
