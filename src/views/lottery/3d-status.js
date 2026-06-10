const WAIT_LOTTERY = 'wait';
const RUNNING_LOTTERY = 'running';
const INIT = 'init';

let lotteryStatus = INIT;

const getStatus = () => {
  return lotteryStatus;
}

const setStatus = (value) => {
  lotteryStatus = value;
}
const setStatusWait = () => {
  lotteryStatus = WAIT_LOTTERY;
}
const setStatusRun = () => {
  lotteryStatus = RUNNING_LOTTERY;
}
const isWait = () => {
  return lotteryStatus === WAIT_LOTTERY;
}
const isRun = () => {
  return lotteryStatus === RUNNING_LOTTERY;
}
const status = {
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
export { lotteryStatus }
export default status;
