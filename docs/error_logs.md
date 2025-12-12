2025-12-12T03:16:24.853165Z DEBUG Using task runner 'io.kestra.plugin.scripts.runner.docker.Docker'
2025-12-12T03:16:24.856748Z TRACE Provided 0 input(s).
2025-12-12T03:16:24.860140Z TRACE Provided 1 input(s).
2025-12-12T03:16:24.935192Z TRACE Container created: dd79d9a1bfbe8fe3e169da1969fcfa0109e26c8e5560b6475c4f1650aed9e091
2025-12-12T03:16:24.950988Z TRACE Volume created: 8e470c1eb9164da7f71451139d7167465fdb85c9b4645332e2fce7d8b804ce43
2025-12-12T03:16:25.092320Z DEBUG Starting command with container id dd79d9a1bfbe8fe3e169da1969fcfa0109e26c8e5560b6475c4f1650aed9e091 [/bin/sh -c set -e
npm install @vapi-ai/server-sdk
node /tmp/kestra-wd/tmp/5scYXR9FJz6V1FkeVijTam/3153265384063158518.js]
2025-12-12T03:16:31.099075Z INFO 
2025-12-12T03:16:31.099367Z INFO added 1 package in 6s
2025-12-12T03:16:31.099508Z ERROR npm notice
2025-12-12T03:16:31.099588Z ERROR npm notice New minor version of npm available! 11.6.2 -> 11.7.0
2025-12-12T03:16:31.099716Z ERROR npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.7.0
2025-12-12T03:16:31.099787Z ERROR npm notice To update run: npm install -g npm@11.7.0
2025-12-12T03:16:31.099850Z ERROR npm notice
2025-12-12T03:16:31.270029Z INFO [VAPI] Calling One Call Plumbing at +13106992541
2025-12-12T03:16:31.270215Z INFO [VAPI] Service: emergency plumbing, Location: greenville sc
2025-12-12T03:16:33.099400Z INFO [VAPI] Call initiated: 019b108f-6936-711a-9dc3-111ee27a0810
2025-12-12T03:16:38.379255Z ERROR Status code: 400
2025-12-12T03:16:38.379517Z ERROR Body: {
2025-12-12T03:16:38.379701Z ERROR   "message": [
2025-12-12T03:16:38.379769Z ERROR     "id must be a valid UUID."
2025-12-12T03:16:38.379816Z ERROR   ],
2025-12-12T03:16:38.379850Z ERROR   "error": "Bad Request",
2025-12-12T03:16:38.379880Z ERROR   "statusCode": 400
2025-12-12T03:16:38.379908Z ERROR }
2025-12-12T03:16:45.176166Z TRACE Container deleted: dd79d9a1bfbe8fe3e169da1969fcfa0109e26c8e5560b6475c4f1650aed9e091
2025-12-12T03:16:45.185728Z TRACE Volume deleted: 8e470c1eb9164da7f71451139d7167465fdb85c9b4645332e2fce7d8b804ce43
2025-12-12T03:16:45.186255Z TRACE Captured 0 output file(s).
2025-12-12T03:16:45.186691Z TRACE io.kestra.core.models.tasks.RunnableTaskException: io.kestra.core.models.tasks.runners.TaskException: Command failed with exit code 1
	at io.kestra.plugin.scripts.exec.scripts.runners.CommandsWrapper.run(CommandsWrapper.java:203)
	at io.kestra.plugin.scripts.node.Script.run(Script.java:213)
	at io.kestra.plugin.scripts.node.Script.run(Script.java:24)
	at io.kestra.worker.WorkerTaskCallable.doCall(WorkerTaskCallable.java:81)
	at io.kestra.worker.AbstractWorkerCallable.call(AbstractWorkerCallable.java:64)
	at io.kestra.worker.WorkerSecurityService.callInSecurityContext(WorkerSecurityService.java:10)
	at io.kestra.worker.DefaultWorker.lambda$callJob$19(DefaultWorker.java:980)
	at io.kestra.core.trace.NoopTracer.inCurrentContext(NoopTracer.java:15)
	at io.kestra.worker.DefaultWorker.callJob(DefaultWorker.java:976)
	at io.kestra.worker.DefaultWorker.runAttempt(DefaultWorker.java:934)
	at io.kestra.worker.DefaultWorker.run(DefaultWorker.java:728)
	at io.kestra.worker.DefaultWorker.handleTask(DefaultWorker.java:379)
	at io.kestra.worker.DefaultWorker.lambda$run$8(DefaultWorker.java:294)
	at io.micrometer.core.instrument.internal.TimedRunnable.run(TimedRunnable.java:49)
	at java.base/java.util.concurrent.ThreadPoolExecutor.runWorker(Unknown Source)
	at java.base/java.util.concurrent.ThreadPoolExecutor$Worker.run(Unknown Source)
	at java.base/java.lang.Thread.run(Unknown Source)
Caused by: io.kestra.core.models.tasks.runners.TaskException: Command failed with exit code 1
	at io.kestra.plugin.scripts.runner.docker.Docker.run(Docker.java:597)
	at io.kestra.plugin.scripts.exec.scripts.runners.CommandsWrapper.run(CommandsWrapper.java:183)
	... 16 more

2025-12-12T03:16:45.186691Z ERROR io.kestra.core.models.tasks.runners.TaskException: Command failed with exit code 1
2025-12-12T03:16:45.186691Z ERROR Command failed with exit code 1