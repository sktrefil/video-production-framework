import type {EditorAction} from "./editorActions";
import {
  createEditorState,
  editorReducer as baseEditorReducer,
} from "./editorReducer.ts";
import type {EditProject, EditorState} from "./editorTypes";

const MAX_HISTORY_ENTRIES = 100;

const projectJson = (project: EditProject) => JSON.stringify(project);

const withDirty = (state: EditorState): EditorState => ({
  ...state,
  dirty: projectJson(state.project) !== state.savedProjectJson,
});

const pushPast = (past: EditProject[], project: EditProject) =>
  [...past, project].slice(-MAX_HISTORY_ENTRIES);

export const editorHistoryReducer = (
  state: EditorState,
  action: EditorAction,
): EditorState => {
  if (action.type === "LOAD_PROJECT") {
    return createEditorState(action.project);
  }

  if (action.type === "MARK_SAVED") {
    return {
      ...state,
      savedProjectJson: projectJson(state.project),
      dirty: false,
    };
  }

  if (action.type === "BEGIN_EDIT_TRANSACTION") {
    if (state.history.transactionBase) {
      return state;
    }
    return {
      ...state,
      history: {
        ...state.history,
        transactionBase: state.project,
      },
    };
  }

  if (action.type === "END_EDIT_TRANSACTION") {
    const base = state.history.transactionBase;
    if (!base) {
      return state;
    }

    const changed = projectJson(base) !== projectJson(state.project);
    const next: EditorState = {
      ...state,
      history: {
        past: changed
          ? pushPast(state.history.past, base)
          : state.history.past,
        future: changed ? [] : state.history.future,
        transactionBase: null,
      },
    };
    return withDirty(next);
  }

  if (action.type === "UNDO") {
    if (state.history.transactionBase) {
      const base = state.history.transactionBase;
      return withDirty({
        ...state,
        project: base,
        selectedItemIds: state.selectedItemIds.filter((id) =>
          base.items.some((item) => item.id === id),
        ),
        history: {
          past: state.history.past,
          future: [state.project, ...state.history.future].slice(
            0,
            MAX_HISTORY_ENTRIES,
          ),
          transactionBase: null,
        },
      });
    }

    const previous =
      state.history.past[state.history.past.length - 1];
    if (!previous) {
      return state;
    }

    return withDirty({
      ...state,
      project: previous,
      selectedItemIds: state.selectedItemIds.filter((id) =>
        previous.items.some((item) => item.id === id),
      ),
      history: {
        past: state.history.past.slice(0, -1),
        future: [state.project, ...state.history.future].slice(
          0,
          MAX_HISTORY_ENTRIES,
        ),
        transactionBase: null,
      },
    });
  }

  if (action.type === "REDO") {
    const nextProject = state.history.future[0];
    if (!nextProject) {
      return state;
    }

    return withDirty({
      ...state,
      project: nextProject,
      selectedItemIds: state.selectedItemIds.filter((id) =>
        nextProject.items.some((item) => item.id === id),
      ),
      history: {
        past: pushPast(state.history.past, state.project),
        future: state.history.future.slice(1),
        transactionBase: null,
      },
    });
  }

  const next = baseEditorReducer(state, action);
  if (next.project === state.project) {
    return next;
  }

  if (state.history.transactionBase) {
    return withDirty({
      ...next,
      history: state.history,
    });
  }

  return withDirty({
    ...next,
    history: {
      past: pushPast(state.history.past, state.project),
      future: [],
      transactionBase: null,
    },
  });
};
