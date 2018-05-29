import {
  NotebookPanel, Notebook
} from '@jupyterlab/notebook';

import {
  Cell // ICellModel
} from '@jupyterlab/cells';

import {
  Message
} from '@phosphor/messaging';

import {
  Widget
} from '@phosphor/widgets';

import {
  CodeMirrorEditor
} from '@jupyterlab/codemirror';

import {
  Styling
} from '@jupyterlab/apputils';

import {
  NotebookInfo
} from "./manager"

import {
  Manager
} from "./manager"

const TOOLBAR_LANGUAGE_DROPDOWN_CLASS = 'jp-NotebooklanguageDropDown';
const CELL_LANGUAGE_DROPDOWN_CLASS = 'jp-CelllanguageDropDown';

export class DefaultLanguageSwitcher extends Widget {
  constructor(widget: Notebook, info: NotebookInfo) {
    super({ node: createLanguageSwitcher(info.KernelList) });
    this.addClass(TOOLBAR_LANGUAGE_DROPDOWN_CLASS);
    this.addClass('sos-widget')

    this._select = this.node.firstChild as HTMLSelectElement;
    Styling.wrapSelect(this._select);

    this._notebook = widget;
    this._info = info;
  }

  public setDefault(language: string): void {
    this._select.value = language;
  }

  public updateOptions(languages: Array<string>): void {
    for (let lan of languages) {
      // ignore if already exists
      if (this._select.options.namedItem(lan))
        continue;
      let option = document.createElement('option');
      option.value = lan;
      option.id = lan;
      option.textContent = lan;
      this._select.appendChild(option);
    }
  }
  /**
   * Handle the DOM events for the widget.
   *
   * @param event - The DOM event sent to the widget.
   */
  handleEvent(event: Event): void {
    if (event.type === 'change') {
      let val = (event.target as HTMLOptionElement).value
      this._info.defaultKernel = val;
      this._notebook.model.metadata.get('sos')['default_kernel'] = val;
    }
  }

  /**
   * Handle `after-attach` messages for the widget.
   */
  protected onAfterAttach(msg: Message): void {
    this._select.addEventListener('change', this);
  }

  /**
   * Handle `before-detach` messages for the widget.
   */
  protected onBeforeDetach(msg: Message): void {
    this._select.removeEventListener('change', this);
  }

  private _select: HTMLSelectElement = null;
  private _info: NotebookInfo = null;
  private _notebook: Notebook = null;
}


/**
 * Create the node for the cell type switcher.
 */
function createLanguageSwitcher(languages): HTMLElement {
  let div = document.createElement('div');
  let select = document.createElement('select');
  for (let lan of languages) {
    let option = document.createElement('option');
    option.value = lan;
    option.id = lan;
    option.textContent = lan;
    select.appendChild(option);
  }
  select.className = TOOLBAR_LANGUAGE_DROPDOWN_CLASS + " sos-widget";
  select.value = 'SoS';
  //select.selectedIndex = languages.indexOf('SoS');
  div.appendChild(select);
  return div;
}

export function saveKernelInfo() {
  let panel = Manager.currentNotebook;
  let info = Manager.manager.get_info(panel);

  let used_kernels = new Set();
  let cells = panel.notebook.model.cells;
  for (var i = cells.length - 1; i >= 0; --i) {
    let cell = cells.get(i);
    if (cell.type === "code" && cell.metadata.get('kernel')) {
      used_kernels.add(cell.metadata.get('kernel'));
    }
  }
  panel.notebook.model.metadata.get("sos")["kernels"] = Array.from(used_kernels).sort().map(
    function(x) {
      return [info.DisplayName[x], info.KernelName[x],
      info.LanguageName[x] || "", info.BackgroundColor[x] || ""
      ]
    }
  );
}

export function addLanSelector(cell: Cell, info: NotebookInfo) {
  if (!cell.model.metadata.has('kernel')) {
    cell.model.metadata.set('kernel', info.defaultKernel);
  }
  let kernel = cell.model.metadata.get('kernel') as string;

  let nodes = cell.node.getElementsByClassName(CELL_LANGUAGE_DROPDOWN_CLASS) as HTMLCollectionOf<HTMLElement>;
  if (nodes.length === 0) {
    // if there is no selector, create one
    let select = document.createElement('select');
    for (let lan of info.KernelList) {
      let option = document.createElement('option');
      option.value = lan;
      option.id = lan;
      option.textContent = lan;
      select.appendChild(option);
    }
    select.className = CELL_LANGUAGE_DROPDOWN_CLASS + " sos-widget";
    let editor = cell.node.getElementsByClassName("jp-InputArea-editor")[0];
    editor.insertBefore(select, editor.children[0]);
    select.value = kernel;
    select.addEventListener('change', function(evt) {
      // set cell level meta data
      let kernel = (evt.target as HTMLOptionElement).value;
      cell.model.metadata.set('kernel', kernel);
      info.sos_comm.send({'set-editor-kernel': kernel})
      // change style
      changeStyleOnKernel(cell, kernel, info);
      // set global meta data
      saveKernelInfo();
    });

  } else {
    // use the existing dropdown box
    let select = nodes.item(0) as HTMLSelectElement;
    // update existing
    for (let lan of info.KernelList) {
      // ignore if already exists
      if (select.options.namedItem(lan))
        continue;
      let option = document.createElement('option');
      option.value = lan;
      option.id = lan;
      option.textContent = lan;
      select.appendChild(option);
    }
    select.value = kernel ? kernel : 'SoS';
  }
}

export function changeStyleOnKernel(cell: Cell, kernel: string, info: NotebookInfo) {
  // Note: JupyterLab does not yet support tags
  if (cell.model.metadata.get('tags') && (cell.model.metadata.get('tags') as Array<string>).indexOf("report_output") >= 0) {
    let op = cell.node.getElementsByClassName('jp-Cell-outputWrapper') as HTMLCollectionOf<HTMLElement>;
    for (let i = 0; i < op.length; ++i)
      op.item(i).classList.add('report-output');
  } else {
    let op = cell.node.getElementsByClassName('jp-Cell-outputWrapper') as HTMLCollectionOf<HTMLElement>;
    for (let i = 0; i < op.length; ++i)
      op.item(i).classList.remove('report-output');
  }

  // cell in panel does not have prompt area
  var col = "";
  if (kernel && info.BackgroundColor[kernel]) {
    col = info.BackgroundColor[kernel];
  }
  let prompt = cell.node.getElementsByClassName("jp-InputPrompt") as HTMLCollectionOf<HTMLElement>;
  if (prompt.length > 0)
    prompt[0].style.backgroundColor = col;
  prompt = cell.node.getElementsByClassName("jp-OutputPrompt") as HTMLCollectionOf<HTMLElement>;
  for (let i = 0; i < prompt.length; ++i) {
    prompt.item(i).style.backgroundColor = col;
  }
  // cell.user_highlight = {
  //     name: 'sos',
  //     base_mode: info.LanguageName[kernel] || info.KernelName[kernel] || kernel,
  // };
  // //console.log(`Set cell code mirror mode to ${cell.user_highlight.base_mode}`)
  let base_mode = info.LanguageName[kernel] || info.KernelName[kernel] || kernel;
  if (!base_mode || base_mode.toLowerCase() === 'sos') {
    (cell.inputArea.editorWidget.editor as CodeMirrorEditor).setOption('mode', 'sos');
  } else {
    (cell.inputArea.editorWidget.editor as CodeMirrorEditor).setOption('mode', {
      name: 'sos',
      base_mode: base_mode,
    });
  }
}

export function updateCellStyles(panel: NotebookPanel, info: NotebookInfo) {
  var cells = panel.notebook.widgets;

  // setting up background color and selection according to notebook metadata
  for (let i = 0; i < cells.length; ++i) {
    addLanSelector(cells[i], info);
    if (cells[i].model.type === "code") {
      changeStyleOnKernel(cells[i], cells[i].model.metadata.get('kernel') as string, info);
    }
  }

  // $("[id^=status_]").removeAttr("onClick").removeAttr("onmouseover").removeAttr("onmouseleave");
  // var tasks = $("[id^=status_]");
  // info.unknown_tasks = [];
  // for (i = 0; i < tasks.length; ++i) {
  //     // status_localhost_5ea9232779ca1959
  //     if (tasks[i].id.match("^status_[^_]+_[0-9a-f]{16,32}$")) {
  //         tasks[i].className = "fa fa-fw fa-2x fa-refresh fa-spin";
  //         info.unknown_tasks.push(tasks[i].id);
  //     }
  // }
}
