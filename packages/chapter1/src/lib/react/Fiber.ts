import EventBus from "@kjojs/eventbus";
import { ReactComponent, ReactElement } from "./ReactElement";
import { PatchNode } from "./PatchNode";
import { FiberEffect, fiberIndicator } from "./Effects";
import { fiberTransition } from "./Transition";

interface FiberChild {
  fragmentPatchNode: PatchNode;
  fiber: Fiber;
}

// 참고 소스코드
// : https://github.com/facebook/react/blob/338dddc089d5865761219f02b5175db85c54c489/packages/react-reconciler/src/ReactFiber.js
//
// Fiber는 모듈이라기보다는 렌더링 작업노드에 대한 명세서 객체입니다.
// 이해하기 쉽도록 객체지향 기반의 코드로 변형된 설계입니다.
export class Fiber extends EventBus<{
  setState: {
    effect: FiberEffect;
    transitonKey: string | null;
  };
}> {
  static createRoot(component: ReactComponent) {
    const key = '__root__';

    return new Fiber(
      key,
      null,
      {},
      [],
      component,
      [],
      true,
    );
  }

  static createChild({
    key,
    element,
    parent,
  }: {
    key: string;
    element: ReactElement;
    parent: Fiber;
  }) {
    return new Fiber(
      key,
      parent,
      element.props,
      [],
      element.type as ReactComponent,
      [],
      false,
    );
  }
  private _childCursor = -1;
  private _pendingProps: Record<string, any>;
  private _pendingStates: any[];

  constructor(
    private _key: string,
    private _parent: Fiber | null,
    private _props: Record<string, any>,
    private _states: any[],
    private _component: ReactComponent,
    private _children: Array<FiberChild>,
    private _isRoot: boolean,
    private _patchNode: PatchNode = PatchNode.createFragment(_key),
    private _isRendered = false,
  ) {
    super();
    this._pendingProps = {..._props};
    this._pendingStates = [..._states];
    this.on('setState', fiber => _parent?.emit('setState', fiber));
  }
  
  get key() {
    return this._key;
  }

  get pendingStates() {
    return this._pendingStates;
  }

  get patchNode() {
    return this._patchNode;
  }

  get component() {
    return this._component;
  }

  get name() {
    return this._component.name;
  }

  setRoot() {
    this._isRoot = true;
  }

  updatePendingProps(newPendingProps: Record<string, any>) {
    this._pendingProps = newPendingProps;
  }

  next(): Fiber | null {
    this._childCursor++;
    const child = this._children[this._childCursor];
    if (child) {
      return child.fiber;
    }
    if (this._isRoot) {
      return null;
    }
    if (this._parent) {
      return this._parent.next();
    }

    return null;
  }

  render() {
    if (this._isRenderRequired()) {
      fiberIndicator.cursor = this;
      fiberIndicator.stateIndex = 0;
      const element = this._component(this._pendingProps);
      fiberIndicator.cursor = null;
      fiberIndicator.stateIndex = -1;

      this._patchNode = this._render(element, 0, 0);
    }
    this._parent?.patchNode.replaceDescendants(this._patchNode);
    this._isRendered = true;
  }

  createDispatcher = (stateIndex: number) => {
    return (state: any) => {
      this.emit('setState', {
        effect: {
          key: this._key,
          task: (fiber) => {
            fiber.pendingStates[stateIndex] = state;
          },
        },
        transitonKey: fiberTransition.transitionKey,
      });
    };
  }

  copy(parent: Fiber | null): Fiber {
    const newPatchNode = this._patchNode.copy();

    if (parent) {
      if (!parent.patchNode.replaceDescendants(newPatchNode)) {
        throw new Error('알수 없는 오류');
      }
    }

    const fiber = new Fiber(
      this._key,
      parent,
      {...this._props},
      [...this._states],
      this._component,
      [],
      this._isRoot,
      newPatchNode,
      this._isRendered,
    );

    this._children.forEach(child => {
      const childFiber = child.fiber.copy(fiber);

      fiber._children.push({
        fiber: childFiber,
        fragmentPatchNode: childFiber.patchNode, 
      });
    });

    return fiber;
  }

  findDescendants(key: string): FiberChild | null {
    let childIndex = this._findChildIndex(key);
    if (childIndex >= 0) {
      return this._children[childIndex];
    }

    for (let i = 0; i < this._children.length; i++) {
      const child = this._children[i].fiber;
      const grandchild = child.findDescendants(key);

      if (grandchild) {
        return grandchild;
      }
    }

    return null;
  }

  callAfterCommit(): void {
    this._props = {...this._pendingProps};
    this._states = [...this._pendingStates];
    this._children.forEach(child => child.fiber.callAfterCommit());
  }

  private _render(
    element: ReactElement,
    depth: number,
    index: number,
  ): PatchNode {
    if (element.isComponent) {
      return this._renderComponent(element, depth, index);
    } else {
      return this._renderElement(element, depth, index);
    }
  }

  private _renderComponent(
    element: ReactElement,
    depth: number,
    index: number,
  ): PatchNode {
    const key = ReactElement.getKey(this._key, depth, index);
    const childIndex = this._findChildIndex(key);
    const child = this._children[childIndex]?.fiber;
    const fragmentPatchNode = PatchNode.createFragment(key);

    if (child && child.component === element.type) {
      child.updatePendingProps(element.props);
      
      return fragmentPatchNode;
    }

    const fiberChild: FiberChild = {
      fiber: Fiber.createChild({
        key,
        element,
        parent: this,
      }),
      fragmentPatchNode,
    };

    if (!child) {
      this._children.push(fiberChild);
    } else {
      this._children.splice(childIndex, 1, fiberChild);
    }

    return fragmentPatchNode;
  }

  private _renderElement(
    element: ReactElement,
    depth: number,
    index: number,
  ): PatchNode {
    const props = element.props;
    let onClick = null;
    if (props['onClick']) {
      onClick = props['onClick'];
      delete props['onClick'];
    }

    const key = (depth === 0 && index === 0) ? this._key : ReactElement.getKey(this._key, depth, index);
    const textContent = typeof element.children === 'string' ? element.children : null;
    const patchNode = new PatchNode(
      key,
      element.type as string,
      props,
      [],
      textContent,
      false,
      onClick,
    );

    if (Array.isArray(element.children)) {
      element.children.forEach((child, i) => {
        patchNode.children[i] = this._render(child, depth + 1, i);
      });
    }

    return patchNode;
  }

  private _findChildIndex(key: string): number {
    return this._children.findIndex(child => child.fiber.key === key);
  }

  private _isSame(): boolean {
    const isSameStates = this._states.every((state, i) => state === this._pendingStates[i]);
    const isSameProps = Object.entries(this._props).every(([key, value], i) => value === this._pendingProps[key]);

    return isSameProps && isSameStates;
  }

  private _isRenderRequired(): boolean {
    return !this._isRendered || !this._isSame() || fiberTransition.isTransitionPending;
  }
}
