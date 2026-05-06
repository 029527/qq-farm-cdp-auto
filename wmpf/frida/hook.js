const getMainModule = (version) => {
    if (version >= 13331) {
        return Process.findModuleByName("flue.dll");
    }
    return Process.findModuleByName("WeChatAppEx.exe");
};

const patchCDPFilter = (base, config) => {
    // xref: SendToClientFilter OR devtools_message_filter_applet_webview.cc
    const offset = config.CDPFilterHookOffset;
    Interceptor.attach(base.add(offset), {
        onEnter(args) {
            send(
                `[patch] CDP filter on enter, original value of input: ${args[0].readPointer()}`,
            );
            this.inputValue = args[0];
        },
        onLeave(retval) {
            const inputValue = this.inputValue.readPointer();
            if (inputValue.isNull() || inputValue.add(8).isNull()) {
                // there's a chance the value could be null
                // return here to avoid crash
                return;
            }

            send(
                `[patch] CDP filter on leave, patch input, now value: ${inputValue}; ` +
                    `*(input + 8) = ${inputValue.add(8).readU32()}`,
            );
            if (inputValue.add(8).readU32() == 6) {
                inputValue.add(8).writeU32(0x0);
            }
        },
    });
};

const hookOnLoadScene = (a1, sceneOffsets) => {
    const miniappConfigPtr = a1
        .add(56)
        .readPointer()
        .add(sceneOffsets[0])
        .readPointer();
    const miniappScenePtr = miniappConfigPtr
        .add(8)
        .readPointer()
        .add(sceneOffsets[1])
        .readPointer()
        .add(16)
        .readPointer()
        .add(sceneOffsets[2]);
    send(`[hook] scene: ${miniappScenePtr.readInt()}`);

    const sceneNumber = miniappScenePtr.readInt();
    // 1000: from issue #83 <-- will crash the process
    // 其余入口场景在不同微信版本/入口里波动很大，继续使用白名单会导致“小游戏已打开但调试桥完全不起”
    // 的情况，所以这里改成仅屏蔽明确有风险的 scene。
    const blockedSceneNumbers = new Set([1000]);
    if (!Number.isInteger(sceneNumber) || sceneNumber <= 0) {
        return;
    }
    if (blockedSceneNumbers.has(sceneNumber)) {
        send(`[hook] skip blocked scene: ${sceneNumber}`);
        return;
    }
    send("[hook] hook scene condition -> 1101");
    miniappScenePtr.writeInt(1101);

    // TODO: customize debugging endpoint
    // const websocketServerStringPtr = passArgs.add(8).readPointer().add(520);
    // VERBOSE && console.log("[hook] hook websocket server, original: ", websocketServerStringPtr.readUtf8String());
    // websocketServerStringPtr.writeUtf8String("ws://127.0.0.1:8189/");
};

const patchOnLoadStart = (base, config) => {
    // xref: AppletIndexContainer::OnLoadStart
    Interceptor.attach(base.add(config.LoadStartHookOffset), {
        onEnter(args) {
            send(
                `[inteceptor] AppletIndexContainer::OnLoadStart onEnter, ` +
                    `indexContainer.this: ${this.context.rcx}`,
            );
            // write dl to 0x1
            if ((this.context.rdx & 0xff) !== 1) {
                this.context.rdx = (this.context.rdx & ~0xff) | 0x1;
            }
            // handle onLoad scene
            hookOnLoadScene(this.context.rcx, config.SceneOffsets);
        },
        onLeave(retval) {
            // do nothing
        },
    });
};

const parseConfig = () => {
    const rawConfig = `@@CONFIG@@`;
    if (rawConfig.includes("@@")) {
        // test addresses
        return {
            Version: 18955,
            LoadStartHookOffset: "0x25B52C0",
            CDPFilterHookOffset: "0x30248B0",
            SceneOffsets: [1408, 1344, 488],
        };
    }
    return JSON.parse(rawConfig);
};

const main = () => {
    const config = parseConfig();
    const mainModule = getMainModule(config.Version);
    patchOnLoadStart(mainModule.base, config);
    patchCDPFilter(mainModule.base, config);
};

main();
