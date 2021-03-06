/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @flow
 * @emails oncall+draft_js
 */

'use strict';

import type DraftEditor from 'DraftEditor.react';
import type SelectionState from 'SelectionState';

const DataTransfer = require('DataTransfer');
const DraftModifier = require('DraftModifier');
const EditorState = require('EditorState');

const findAncestorOffsetKey = require('findAncestorOffsetKey');
const getTextContentFromFiles = require('getTextContentFromFiles');
const getUpdatedSelectionState = require('getUpdatedSelectionState');
const isEventHandled = require('isEventHandled');
const nullthrows = require('nullthrows');

/**
 * Get a SelectionState for the supplied mouse event.
 */
function getSelectionForEvent(
  event: Object,
  editorState: EditorState,
): ?SelectionState {
  let node: ?Node = null;
  let offset: ?number = null;

  /* $FlowFixMe(>=0.68.0 site=www,mobile) This comment suppresses an error
   * found when Flow v0.68 was deployed. To see the error delete this comment
   * and run Flow. */
  if (typeof document.caretRangeFromPoint === 'function') {
    const dropRange = document.caretRangeFromPoint(event.x, event.y);
    node = dropRange.startContainer;
    offset = dropRange.startOffset;
  } else if (event.rangeParent) {
    node = event.rangeParent;
    offset = event.rangeOffset;
  } else if (window.getSelection) {
    node = event.target;
    var selection = window.getSelection();
    var range = selection.getRangeAt ? selection.getRangeAt(0) : selection.createRange();

    // If the range is collapsed, drag and drop occurred within the input.
    // Otherwise it is from outside the input and we can't get where the user is positioned so copy to the end.
    offset = range.collapsed ? selection.focusOffset : event.srcElement.innerText.length;
  } else {
    return null;
  }

  node = nullthrows(node);
  offset = nullthrows(offset);
  const offsetKey = nullthrows(findAncestorOffsetKey(node));

  return getUpdatedSelectionState(
    editorState,
    offsetKey,
    offset,
    offsetKey,
    offset,
  );
}

const DraftEditorDragHandler = {
  /**
   * Drag originating from input terminated.
   */
  onDragEnd: function(editor: DraftEditor): void {
    editor.exitCurrentMode();
  },

  /**
   * Handle data being dropped.
   */
  onDrop: function(editor: DraftEditor, e: Object): void {
    const data = new DataTransfer(e.nativeEvent.dataTransfer);

    const editorState: EditorState = editor._latestEditorState;
    const dropSelection: ?SelectionState = getSelectionForEvent(
      e.nativeEvent,
      editorState,
    );

    e.preventDefault();
    editor.exitCurrentMode();

    if (dropSelection == null) {
      return;
    }

    const files = data.getFiles();
    if (files.length > 0) {
      if (
        editor.props.handleDroppedFiles &&
        isEventHandled(editor.props.handleDroppedFiles(dropSelection, files))
      ) {
        return;
      }

      getTextContentFromFiles(files, fileText => {
        fileText &&
          editor.update(
            insertTextAtSelection(editorState, dropSelection, fileText),
          );
      });
      return;
    }

    const dragType = editor._internalDrag ? 'internal' : 'external';
    if (
      editor.props.handleDrop &&
      isEventHandled(editor.props.handleDrop(dropSelection, data, dragType))
    ) {
      return;
    }

    if (editor._internalDrag) {
      editor.update(moveText(editorState, dropSelection));
      return;
    }

    editor.update(
      insertTextAtSelection(editorState, dropSelection, data.getText()),
    );
  },

  /**
   * Handle on drag over event.
   */
  onDragOver: function onDragOver(editor: DraftEditor, e: Object): void {
    e.preventDefault();
  }
};

function moveText(
  editorState: EditorState,
  targetSelection: SelectionState,
): EditorState {
  const newContentState = DraftModifier.moveText(
    editorState.getCurrentContent(),
    editorState.getSelection(),
    targetSelection,
  );
  return EditorState.push(editorState, newContentState, 'insert-fragment');
}

/**
 * Insert text at a specified selection.
 */
function insertTextAtSelection(
  editorState: EditorState,
  selection: SelectionState,
  text: string,
): EditorState {
  const newContentState = DraftModifier.insertText(
    editorState.getCurrentContent(),
    selection,
    text,
    editorState.getCurrentInlineStyle(),
  );
  return EditorState.push(editorState, newContentState, 'insert-fragment');
}

module.exports = DraftEditorDragHandler;
