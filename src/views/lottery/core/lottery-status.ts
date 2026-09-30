const WAIT_LOTTERY = 'wait';
const RUNNING_LOTTERY = 'running';
const INIT = 'init';

export type LotteryStatus = typeof WAIT_LOTTERY | typeof RUNNING_LOTTERY | typeof INIT;

let lotteryStatus: LotteryStatus = INIT;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getStatus = () => {
  return lotteryStatus;
}

const setStatus = (value: LotteryStatus) => {
  if (lotteryStatus === value) return;
  lotteryStatus = value;
  listeners.forEach(listener => listener());
}
const setStatusWait = () => {
  setStatus(WAIT_LOTTERY);
}
const setStatusRun = () => {
  setStatus(RUNNING_LOTTERY);
}
const isWait = () => {
  return lotteryStatus === WAIT_LOTTERY;
}
const isRun = () => {
  return lotteryStatus === RUNNING_LOTTERY;
}
const status = {
  subscribe,
  getStatus,
  setStatus,
  setStatusWait,
  setStatusRun,
  isWait,
  isRun,
  WAIT_LOTTERY,
  RUNNING_LOTTERY,
  INIT
}
export default status;
