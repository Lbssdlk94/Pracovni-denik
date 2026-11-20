// Isolated loopback visual tests only. Never imported by the production Worker.
const NativeDate=Date;
const fixed=Number(process.env.DIARY_VISUAL_TIME || 1795255200000);
globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
