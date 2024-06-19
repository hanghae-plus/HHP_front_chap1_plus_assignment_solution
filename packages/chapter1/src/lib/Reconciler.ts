import { Fiber } from "./react/Fiber";
import Scheduler from "./Scheduler";
import { ReactComponent } from "./react/ReactElement";
import { PatchNode } from "./react/PatchNode";
import { FiberRoot } from "./react/FiberRoot";
import Renderer from "./Renderer";
import { FiberEffect } from "./react/Effects";

// 참고 소스코드
// Reconciler 주요 동작
// : https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberReconciler.js
// Fiber 스케줄링 동작
// : https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberWorkLoop.js#L744
class Reconciler {
  private _current: FiberRoot | null = null;

  constructor(
    private _scheduler: Scheduler,
    private _renderer: Renderer,
  ) {
    // 2. 스케줄러가 렌더링이 완료되었다고 알려주면
    // workInProgress와 current 트리를 비교하여 커밋합니다.
    // 비교 결과는 현재 코드에서는 PatchNode라는 구조체를 활용합니다.
    this._scheduler.on('renderComplete', (workInProgress) => {
      this._commit(workInProgress, this._diff(workInProgress));
    });
  }

  // 첫 마운트 시
  // 1-1. workInProgress 트리가 생성되며 스케줄러에 할당됩니다.
  mount(component: ReactComponent) {
    const workInProgress = new FiberRoot(Fiber.createRoot(component));

    this._scheduler.schedule(
      workInProgress,
      [],
      null,
    );
  }

  // state 변경 시
  // 1-2. workInProgress 트리가 생성되며 스케줄러에 할당됩니다.
  private _setState(
    effect: FiberEffect,
    transitionKey: string | null,
  ) {
    if (!this._current) {
      throw new Error('assert');
    }

    const workInProgress = this._current.copy();

    workInProgress.setCurrent(effect.key);
    this._scheduler.schedule(
      workInProgress,
      [effect],
      transitionKey,
    );
  }

  // 3. current 트리가 없으면 모든 patchNode의 dirty 값을 true로 바꿉니다.
  // - dirty: true인 patchNode는 변경사항을 반영해야한다는 뜻 입니다.
  private _diff(workInProgress: FiberRoot): PatchNode {
    return this._compare(
      this._current?.patchNode || null,
      workInProgress.patchNode,
    );
  }

  // 4. 비교로직을 수행하여 patchNode를 반환합니다.
  private _compare(before: PatchNode | null, after: PatchNode): PatchNode {
    if (before) {
      if (before.tagName !== after.tagName) {
        after.dirty = true;
      } else if (Object.keys(after.attributes).some(key => before.attributes[key] !== after.attributes[key])) {
        after.dirty = true;
      } else if (after.content !== before.content) {
        after.dirty = true;
      }
    } else {
      after.dirty = true;
    }

    if (after.children.length > 0) {
      after.children.some((afterChild, i) => {
        const beforeChild = before?.children[i] || null;
        this._compare(beforeChild, afterChild);
      });
    }

    return after;
  }

  // 5. 비교가 완료되었으면 patchNode를 renderer에 반영 요청합니다.
  // - renderer 반영은 동기적으로 수행됩니다.
  // - 완료되면 workInProgress 트리가 current 트리가 됩니다. (dirty는 다시 false)
  private _commit(workInProgress: FiberRoot, patchNode: PatchNode) {
    this._renderer.apply(patchNode);
    // this._current?.off(); // event system 을 분리하지 않아서 우선은 메모리 누수 놔둔 상태입니다.
    this._current = workInProgress;
    this._current.callAfterCommit();
    this._current!.on('setState', ({ effect, transitonKey }) => {
      this._setState(effect, transitonKey);
    });
  }
}

export default Reconciler;
