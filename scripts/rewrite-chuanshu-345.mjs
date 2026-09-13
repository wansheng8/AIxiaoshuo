import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { getNovel, saveNovel, now } = require("../backend/src/store");
const { completeChat } = require("../backend/src/llm");
const { countWords } = require("../backend/src/context");
const { cleanProse } = require("../backend/src/apply");

const PROJECT = "nv_mtl8h4nr_gwl34t";

const CAST = `钉死人名：穿书者林奇；穿书后身份陈无咎（外门废柴男配）；原书男主萧云澜（男）；原书女主苏晚晴；外门执事孙有才；反派血衣楼探子老猫/尹赤一侧。调性轻喜剧加烧脑，林奇嘴贱怕死脑子活。禁止把萧云澜写成女。`;

function tail(text, n = 900) {
  const t = String(text || "").trim();
  return t.slice(-n);
}

function head(text, n = 700) {
  return String(text || "").trim().slice(0, n);
}

const JOBS = [
  {
    index: 3,
    title: "问心石上三更雨",
    extra: `从上一章最后一句「你是怎么看出来的呢？」接着写。说话的是回廊阴影里的苏晚晴，她转着铜钱，问林奇怎么看出萧云澜有暗伤。
林奇用外门废柴的憨笑搪塞，心里发毛。系统弹出奖励：一枚「培元废丹」。他当众或回石屋硬吃，立刻腹泻，场面要丑、要具体。
苏晚晴仍不走，问他为什么不怕萧云澜。林奇不敢说穿书。
章末系统发布新任务：今夜必须偷走萧云澜枕下那块玉。失败扣寿命。停在任务面板上，让他不得不动身。
篇幅 2400 到 3400 字。不要章名。`,
  },
  {
    index: 4,
    title: "枕下玉",
    extra: `从上一章任务「今夜必须偷走萧云澜枕下那块玉」接着写。林奇连夜摸进内门男主住所。
差点被巡夜弟子撞见，他用自己当年写进原书的巡夜漏洞（更香交接空档、某段墙根无灯）溜走。
玉入手后发烫，玉里映出一个他当作者时随手写错的地名。
系统提示任务完成，同时剧情偏离度 +17%。
章末停在这块发烫的玉和偏离度上，他还没处藏。
禁止写成玉已经在他床底下。禁止萧云澜是女。
篇幅 2400 到 3400 字。不要章名。`,
  },
  {
    index: 5,
    title: "玉在茅房亮了个相",
    extra: `从上一章玉入手、偏离度+17%接着写。天未亮，外门大搜，因为萧云澜发现枕下玉丢了。
林奇把真玉用油布裹了塞进茅房坑位边的砖缝。系统改任务：当众把玉交出去并承认。
他交一块从杂役房摸来的假玉。执事暂时被糊弄过去。
真玉在茅房里自己亮了，被尹赤一侧的探子看见。
章末必须接到下一章第一句：孙有才带着两个灰袍执事，举着火符，停在林奇石屋门口。
也就是：搜检过后夜已深，他刚把假玉的事圆过去，回到自己石屋，门外脚步声由远及近，门被拍响，他透过门缝看见火符和孙有才。
停在开门之前。
篇幅 2400 到 3400 字。不要章名。`,
  },
];

async function main() {
  for (const job of JOBS) {
    const novel = getNovel(PROJECT);
    const curr = novel.chapters.find((c) => c.index === job.index);
    const prev = novel.chapters.find((c) => c.index === job.index - 1);
    const next = novel.chapters.find((c) => c.index === job.index + 1);
    if (!curr || !prev) throw new Error(`缺章 ${job.index}`);
    curr.title = job.title;
    process.stdout.write(`rewrite 第${job.index}章 ${job.title} ... `);
    const output = await completeChat({
      temperature: 0.82,
      timeoutMs: 180000,
      messages: [
        {
          role: "system",
          content:
            "你是墨枢的章节正文写手。直接输出正文。不要章名，不要 Markdown 标题，不要说明。第一段必须接住上一章结尾。简体中文。",
        },
        {
          role: "user",
          content: `${CAST}

# 书名
《${novel.title}》 ${novel.logline || ""}

# 上一章结尾（必须从这里接着写）
${tail(prev.content, 1200)}

# 下一章现有开头（本章结尾要能接到这里，不要写成下一章）
${next ? head(next.content, 500) : "无"}

# 作者指令
${job.extra}`,
        },
      ],
    });
    curr.content = cleanProse(output);
    curr.wordCount = countWords(curr.content);
    curr.updatedAt = now();
    saveNovel(novel);
    console.log(`${curr.wordCount}字`);
    if (curr.wordCount < 1800) throw new Error(`第${job.index}章太短`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
