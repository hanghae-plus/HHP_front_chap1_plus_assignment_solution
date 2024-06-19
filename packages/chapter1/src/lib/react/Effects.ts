import { Fiber } from "./Fiber";

interface FiberIndicator {
  cursor: Fiber | null;
  stateIndex: number;
}

// hook에 의존성을 주입하기 위한 객체입니다.
export const fiberIndicator: FiberIndicator = {
  cursor: null,
  stateIndex: -1,
}

export interface FiberEffect {
  key: string;
  task: (fiber: Fiber) => void;
}

export function useState<T = any>(initialState: T) {
  const fiber = fiberIndicator.cursor;
  if (!fiber) {
    throw new Error('알수없는 오류 발생!');
  }

  const isInitialCall = fiber.pendingStates.length - 1 < fiberIndicator.stateIndex;
  const state = isInitialCall ? initialState : fiber.pendingStates[fiberIndicator.stateIndex];
  fiber.pendingStates[fiberIndicator.stateIndex] = state;

  const dispatcher = fiber.createDispatcher(fiberIndicator.stateIndex);
  fiberIndicator.stateIndex++;

  return [state, dispatcher];
}
