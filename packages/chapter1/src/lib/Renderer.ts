import { PatchNode } from "./react/PatchNode";

interface RenderUnit {
  patch: PatchNode;
  parent: Element;
  index: number;
}

// PatchNode를 실제 DOM에 반영하는 모듈입니다.
class Renderer {
  constructor(
    private _containerElement: HTMLElement,
  ) {}

  apply(patch: PatchNode) {
    const queue: Array<RenderUnit> = [{
      patch,
      parent: this._containerElement,
      index: 0,
    }];

    while (queue.length > 0) {
      const unit = queue.shift()!;
      const patch = unit.patch.flat();
      if (patch) {
        unit.patch = patch;
      } else {
        continue;
      }

      const parent = this._sync(unit);
      const patchChildren = unit.patch.children;
      if (patchChildren && Array.isArray(patchChildren)) {
        queue.push(...patchChildren.map((patch, i) => ({
          patch,
          parent,
          index: i,
        })));
      }
    }
  }

  private _sync(unit: RenderUnit): Element {
    const { patch, parent, index } = unit;

    if (!parent.children || !parent.children[index]) {
      return this._appendNew(unit);
    }
    if (!patch.dirty) {
      return this._keep(unit);
    }

    return this._update(unit);
  }

  private _appendNew({ patch, parent }: RenderUnit): Element {
    const domHtml = this._getDomHtml(patch)

    parent.insertAdjacentHTML('beforeend', domHtml);

    const element = parent.lastElementChild as HTMLElement;
    this._attachEvents(element, patch);

    return element;
  }

  private _update(unit: RenderUnit): Element {
    const { patch, parent, index } = unit;
    const existed = parent.children[index] as HTMLElement;
    if (!existed) {
      return this._appendNew(unit);
    }

    this._clearEvents(existed);
    let element: HTMLElement = existed;
    if (existed.tagName.toLowerCase() !== unit.patch.tagName) {
      const domHtml = this._getDomHtml(patch);
      existed.insertAdjacentHTML('afterend', domHtml);

      element = existed.nextElementSibling as HTMLElement;
      existed.remove();
    } else {
      const { attributes } = unit.patch;
      
      existed.className = attributes['className'];
      if (patch.content !== null) {
        existed.innerText = patch.content;
      }
    }
    this._attachEvents(element, unit.patch);

    return element;
  }

  private _keep({ parent, index, patch }: RenderUnit): Element {
    const element = parent.children[index] as HTMLElement;

    this._clearEvents(element);
    this._attachEvents(element, patch);

    return element;
  }

  private _getDomHtml(patchNode: PatchNode): string {
    const patch = patchNode.isFragment ? (patchNode.children as PatchNode[])[0] : patchNode;
    const textContent = patch.content || '';
    const className = patch.attributes['className']
    const attributes = className ? ` class="${className}"` : '';
    const domHtml = `<${patch.tagName}${attributes}>${textContent}</${patch.tagName}>`;

    return domHtml;
  }

  private _attachEvents(el: Element, patchNode: PatchNode): void {
    if (patchNode.onClick) {
      (el as any).__REACT_EVENTS__ = {
        'click': patchNode.onClick,
      };
      el.addEventListener('click', patchNode.onClick);
    }
  }

  private _clearEvents(el: Element): void {
    const events = (el as any).__REACT_EVENTS__ || {};
    
    Object.entries(events).forEach(([name, handler]) => {
      el.removeEventListener(name, handler as () => void);
    });
  }
}

export default Renderer;
