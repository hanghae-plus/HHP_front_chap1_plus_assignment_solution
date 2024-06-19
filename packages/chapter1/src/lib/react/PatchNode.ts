// React에서는 다른 방식으로 처리하지만 (updateQueue, Lane)
// 현재 구조에 맞게 변경사항을 업데이트 하기 위한 객체입니다.

export class PatchNode {
  static fragmentKey = '__fragment__';

  static createFragment(
    key: string,
  ) {
    return new PatchNode(
      key,
      PatchNode.fragmentKey,
      {},
      [],
      null,
      false,
      null,
    );
  }

  constructor(
    // key 값입니다.
    private _key: string,
    // type이 문자열이면 렌더링 할 요소의 tagName을 의미합니다.
    // 함수가 들어오면 렌더링 해야할 컴포넌트입니다.
    private _tagName: string,
    // 속성 객체입니다.
    private _attributes: Record<string, any>,
    // 자식 요소입니다.
    private _children: Array<PatchNode>,
    // text 컨텐트입니다.
    private _content: string | null,
    // dirty가 true면 변경사항을 반영해야 합니다.
    private _dirty: boolean,
    // 클릭 이벤트
    private _onClick: (() => void) | null,
  ) {}

  get key() {
    return this._key;
  }

  get tagName() {
    return this._tagName;
  }

  get attributes() {
    return this._attributes;
  }

  get children() {
    return this._children;
  }

  get content() {
    return this._content;
  }

  get dirty() {
    return this._dirty;
  }

  get onClick() {
    return this._onClick;
  }

  get isFragment() {
    return this._tagName === PatchNode.fragmentKey;
  }

  set dirty(dirty: boolean) {
    this._dirty = dirty;
  }

  copy(): PatchNode {
    let children = this._children;
    if (this.isFragment) {
      children = [];
    } else {
      children = this._children.map(child => child.copy());
    }

    return new PatchNode(
      this._key,
      this._tagName,
      {...this._attributes},
      children,
      this._content,
      false,
      this._onClick,
    );
  }

  replaceDescendants(patchNode: PatchNode) {
    let stack: Array<PatchNode> = [...this.children];
    let cursor = null;
    let parentStack: Array<{ patchNode: PatchNode; childLength: number }> = [{
      patchNode: this,
      childLength: this._children.length,
    }];
    do {
      cursor = stack.pop();
      if (!cursor) {
        return false;
      }
      if (patchNode.key === cursor.key) {
        parentStack[parentStack.length - 1].patchNode.replaceChild(patchNode);
        return true;
      }

      parentStack[parentStack.length - 1].childLength--;
      if (parentStack[parentStack.length - 1].childLength === 0) {
        parentStack.pop();
      }

      if (cursor.children.length > 0) {
        stack = stack.concat(cursor.children);
        parentStack.push({
          patchNode: cursor,
          childLength: cursor.children.length,
        });
      }
    } while (cursor)

    return false;
  }

  replaceChild(patchNode: PatchNode) {
    const i = this._children.findIndex(child => child.key === patchNode.key);
    this._children[i] = patchNode;
  }

  flat(): PatchNode | null {
    if (!this.isFragment) {
      return this;
    }
    if (this._children.length > 0) {
      return this._children.find(patchNode => !patchNode.isFragment) || null;
    }

    return null;
  }
}
