import EventBus from "@kjojs/eventbus";
import { Fiber } from "./react/Fiber";
import { FiberRoot } from "./react/FiberRoot";
import { FiberEffect } from "./react/Effects";
import { fiberTransition } from "./react/Transition";

enum ScheduleTaskType {
  Urgent,
  UrgentPending,
  Transition,
}

interface ScheduleTask {
  taskType: ScheduleTaskType;
  root: FiberRoot;
  cursor: Fiber;
  effectMap: Record<string, Array<FiberEffect>>;
  transitionKey: string | null;
  timer: NodeJS.Timeout | null;
  timeTick: number;
}

// Fiber의 작업 우선순위를 조정합니다.
// Fiber 작업을 적절한 시분할로 비동기 렌더링을 하거나 동기 렌더링을 수행합니다.
class Scheduler extends EventBus<{ renderComplete: FiberRoot }> {
  static instance = new Scheduler();

  private _queue: Array<ScheduleTask> = [];
  private _current: ScheduleTask | null = null;

  schedule(
    fiberRoot: FiberRoot,
    effects: FiberEffect[],
    transitionKey: string | null,
  ) {
    const effectMap = effects.reduce((map, effect) => {
      map[effect.key] = map[effect.key] || [];
      map[effect.key].push(effect);

      return map;
    }, {} as Record<string, Array<FiberEffect>>);

    const task: ScheduleTask = {
      taskType: transitionKey ? ScheduleTaskType.Transition : ScheduleTaskType.Urgent,
      root: fiberRoot,
      cursor: fiberRoot.current,
      transitionKey,
      effectMap,
      timeTick: 0,
      timer: null,
    };

    // 1. 트랜지션 작업이 abort 됩니다.
    this._abortIfTransitionTaskExist();
    if (task.transitionKey) {
      this._enqueueTransition(task);
    } else {
      this._enqueueTask(task);
    }
  }

  private _enqueueTask(task: ScheduleTask) {
    if (!this._current) {
      // 3. 작업이 수행됩니다.
      this._current = task;
      this._workAsync(10);
      return;
    }
    
    this._queue.push(task);
  }

  private _enqueueTransition(task: ScheduleTask) {
    if (!task.transitionKey) {
      throw new Error('알수없는 오류');
    }
    const pendingRoot = task.root.copy();
    const pendingTask: ScheduleTask = {
      taskType: ScheduleTaskType.UrgentPending,
      root: pendingRoot,
      cursor: pendingRoot.current,
      effectMap: {},
      transitionKey: task.transitionKey,
      timer: null,
      timeTick: 0,
    };

    // 2. 먼저 pending 렌더링을 한번 수행하고
    // transition 렌더링을 이후에 수행합니다.
    this._enqueueTask(pendingTask);
    this._enqueueTask({
      ...task,
      taskType: ScheduleTaskType.Transition,
      transitionKey: null,
    });
  }

  private _workAsync(delay: number) {
    if (!this._current) {
      return;
    }
    if (this._current.timer) {
      clearTimeout(this._current.timer);
    }

    this._current.timer = setTimeout(() => {
      this._work();
    }, delay);
  }

  private _work() {
    if (!this._current) {
      this._current = this._queue.shift() || null;
      if (this._current) {
        this._work();
      }
      return;
    }

    const {
      taskType,
      cursor,
      root,
      effectMap,
      transitionKey,
    } = this._current;

    // 4-1. effect들을 적용합니다.
    effectMap[cursor.key]?.forEach(effect => {
      effect.task(cursor);
    });

    // 4-2. pending 작업의 경우
    // 훅에서 pending 임을 알 수 있게 값을 주입합니다.
    if (taskType === ScheduleTaskType.UrgentPending) {
      fiberTransition.isTransitionPending = true;
      if (cursor.key === transitionKey) {
        cursor.render();
      }
      fiberTransition.isTransitionPending = false;
    } else {
      // 4-3. 렌더링을 수행합니다.
      cursor.render();
    }

    // 4-4. 다음 fiber 가 있으면 작업을 수행하고
    // 없으면 renderComplete 이벤트가 발생합니다.
    const nextFiber = cursor.next();
    if (!nextFiber) {
      this.emit('renderComplete', root);

      this._current = this._queue.shift() || null;
      if (this._current) {
        this._workAsync(10);
      }
      return;
    }

    // 4-5. 시분할로 동작하기 위한 로직입니다.
    // 50ms 이내에 모두 수행되면 동기적으로 동작합니다.
    // 만약 더 걸리면 비동기로 동작합니다.
    let asyncTask = false;
    const now = performance.now();
    if (this._current.timeTick === 0) {
      this._current.timeTick = now;
    } else if (now - this._current.timeTick > 50) {
      asyncTask = true
    }

    this._current.cursor = nextFiber;
    if (asyncTask) {
      this._workAsync(0);
    } else {
      this._work();
    }
  }

  private _abortIfTransitionTaskExist() {
    while (this._current && this._current.taskType !== ScheduleTaskType.Urgent) {
      this._abortCurrent();
      this._current = this._queue.shift() || null;
    }
  }

  private _abortCurrent() {
    if (!this._current) {
      return;
    }

    if (this._current.timer) {
      clearTimeout(this._current.timer);
    }
    this._current = null;
  }
}

export default Scheduler;
