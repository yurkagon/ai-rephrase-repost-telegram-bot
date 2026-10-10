import { TelegramService } from './telegram.service';

const getMe = jest.fn();

const deleteWebhook = jest.fn();

const callApi = jest.fn<
  Promise<{ update_id: number }[]>,
  [string, { offset?: number }, { signal: AbortSignal }]
>();

const handleUpdate = jest.fn();

const catchUpdate = jest.fn();

jest.mock('telegraf', () => ({
  Telegraf: jest.fn().mockImplementation(() => ({
    handleUpdate,
    catch: catchUpdate,
    telegram: { getMe, deleteWebhook, callApi },
  })),
}));

describe('persistent Telegram polling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    process.exitCode = 0;
  });
  beforeEach(() => {
    jest.clearAllMocks();

    for (const mock of [getMe, deleteWebhook, callApi, handleUpdate, catchUpdate]) mock.mockReset();

    getMe.mockResolvedValue({ id: 1 });
    deleteWebhook.mockResolvedValue(true);
    callApi.mockReturnValue(new Promise(() => {}));
  });
  it('starts in background and aborts polling on shutdown', async () => {
    const service = new TelegramService({ token: 'test' });

    service.onModuleInit();
    expect(catchUpdate).toHaveBeenCalled();
    expect(service.onApplicationBootstrap()).toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));

    const signal = callApi.mock.calls[0][2].signal;

    service.onModuleDestroy();
    expect(signal.aborted).toBe(true);
  });
  it('bounds outbound Telegram requests while retaining polling cancellation', () => {
    const service = new TelegramService({ token: 'test' });

    void service.telegram.callApi('sendMessage', { chat_id: 1, text: 'Offline' });
    expect(callApi.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal);
    expect(callApi.mock.calls[0][2].signal.aborted).toBe(false);
    service.onModuleDestroy();
  });
  it('does not acknowledge a failed persistence handler', async () => {
    const kill = jest.spyOn(process, 'kill').mockImplementation(() => true);

    callApi.mockResolvedValueOnce([{ update_id: 10 }]);
    handleUpdate.mockRejectedValueOnce(new Error('DB unavailable'));

    const service = new TelegramService({ token: 'test' });

    service.onApplicationBootstrap();
    await new Promise((resolve) => setImmediate(resolve));
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    process.exitCode = 0;
    kill.mockRestore();
  });
  it('advances offset only after processing and stops safely during startup', async () => {
    const service = new TelegramService({ token: 'test' });

    callApi.mockResolvedValueOnce([{ update_id: 10 }]);
    handleUpdate.mockResolvedValue(undefined);
    service.onApplicationBootstrap();
    await new Promise((resolve) => setImmediate(resolve));
    expect(callApi.mock.calls[1][1].offset).toBe(11);
    service.onModuleDestroy();

    let complete: (value: unknown) => void = () => {};

    getMe.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );

    const second = new TelegramService({ token: 'test' });

    second.onApplicationBootstrap();
    second.onModuleDestroy();
    complete({ id: 1 });
    await new Promise((resolve) => setImmediate(resolve));
    expect(deleteWebhook).toHaveBeenCalledTimes(1);
  });
});
