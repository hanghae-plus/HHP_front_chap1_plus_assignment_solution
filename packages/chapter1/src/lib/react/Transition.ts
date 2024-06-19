import { fiberIndicator } from "./Effects";

interface FiberTransition {
  transitionKey: string | null;
  isTransitionPending: boolean;
}

// transition에 의존성을 주입하기 위한 객체입니다.
export const fiberTransition: FiberTransition = {
  transitionKey: null,
  isTransitionPending: false,
}

interface StartTransition {
  (callback: () => void): void;
  __key__: string;
}

export function useTransition(): [boolean, StartTransition] {
  const startTransition: StartTransition = (callback: () => void) => {
    fiberTransition.transitionKey = startTransition.__key__;
    callback();
    fiberTransition.transitionKey = null;
  };
  startTransition.__key__ = fiberIndicator.cursor?.key || '';

  return [
    fiberTransition.isTransitionPending,
    startTransition,
  ];
}
