import { SWATCH, joinPropBody, parsePropBody, type AssetField } from "../studio-utils";
import type { StudioAct, StudioAssets, StudioDoc } from "../view-types";
import type { StudioDerived } from "../derive";

type Card = { title: string; role: string; body: string };

type Props = {
  doc: StudioDoc;
  assets: StudioAssets;
  act: StudioAct;
  d: StudioDerived;
  field: AssetField;
  card: Card;
  index: number;
};

export default function AssetCard({ doc, assets, act, d, field, card, index }: Props) {
  const novel = doc.novel;
  if (!novel) return null;
  const propMeta = field === "props" ? parsePropBody(card.body) : null;
  const [desc, prompt] = propMeta
    ? [propMeta.desc, propMeta.prompt]
    : (() => {
        const hit = card.body.split(/提示词[:：]/);
        if (hit.length > 1) return [hit[0].replace(/^描述[:：]\s*/m, "").trim(), hit[1].trim()];
        return [card.body, card.body];
      })();
  const portrait = novel.media?.[`${field}:${card.title}`];
  const colorKey = `${field}:${card.title}#color`;
  const avatarColor = novel.media?.[colorKey] || "";
  const setAvatarColor = (c: string) => {
    const media = { ...(novel.media || {}) };
    if (avatarColor === c) delete media[colorKey];
    else media[colorKey] = c;
    doc.patchNovel({ ...novel, media });
  };
  const skillId = field === "world" ? "world" : field === "props" ? "props" : "characters";
  const writeBody = (next: { desc?: string; prompt?: string; holder?: string; use?: string; cost?: string }) => {
    if (propMeta) {
      assets.writeCard(field, index, {
        ...card,
        body: joinPropBody({
          desc: next.desc ?? propMeta.desc,
          prompt: next.prompt ?? propMeta.prompt,
          holder: next.holder ?? propMeta.holder,
          use: next.use ?? propMeta.use,
          cost: next.cost ?? propMeta.cost,
        }),
      });
      return;
    }
    assets.writeCard(field, index, {
      ...card,
      body: `描述：\n${next.desc ?? desc}\n\n提示词：\n${next.prompt ?? prompt}`,
    });
  };
  return (
    <article className={`asset ${field === "props" ? "prop" : ""}`}>
      <div className="asset-top">
        <div className="avatar" style={!portrait && avatarColor ? { background: avatarColor } : undefined}>
          {portrait ? <img src={portrait} alt="" /> : <span>{card.title.slice(0, 1)}</span>}
          {field !== "props" && (
          <div className="swatches">
            {SWATCH.map((c) => (
              <button
                key={c}
                type="button"
                className={avatarColor === c ? "on" : ""}
                style={{ background: c }}
                title={avatarColor === c ? "取消头像底色" : "设为头像底色"}
                onClick={() => setAvatarColor(c)}
              />
            ))}
          </div>
          )}
        </div>
        <div className="asset-fields">
          <div className="duo">
            <input
              value={card.title}
              onChange={(e) => assets.writeCard(field, index, { ...card, title: e.target.value })}
            />
            <input
              value={card.role || (field === "characters" ? "角色" : field === "props" ? "物件" : "场景")}
              onChange={(e) => assets.writeCard(field, index, { ...card, role: e.target.value })}
            />
          </div>
          <input
            value={card.role}
            placeholder={field === "characters" ? "主角 / 配角" : field === "world" ? "场景类型" : "信物 / 武器 / 载具"}
            onChange={(e) => assets.writeCard(field, index, { ...card, role: e.target.value })}
          />
          {propMeta ? (
            <div className="trio">
              <input
                value={propMeta.holder}
                placeholder="谁拿着"
                onChange={(e) => writeBody({ holder: e.target.value })}
              />
              <input
                value={propMeta.use}
                placeholder="用途"
                onChange={(e) => writeBody({ use: e.target.value })}
              />
              <input
                value={propMeta.cost}
                placeholder="代价"
                onChange={(e) => writeBody({ cost: e.target.value })}
              />
            </div>
          ) : null}
          <div className="duo">
            <label className="field">
              <span>描述</span>
              <textarea
                value={desc}
                onChange={(e) =>
                  writeBody({ desc: e.target.value })
                }
              />
            </label>
            <label className="field prompt-box">
              <span>提示词</span>
              <span className="ai-tag">AI 生成</span>
              <textarea
                value={prompt}
                onChange={(e) =>
                  writeBody({ prompt: e.target.value })
                }
              />
            </label>
          </div>
        </div>
      </div>
      <div className="asset-foot">
        <button className="btn-danger" onClick={() => assets.removeCard(field, index)}>
          删除
        </button>
        <button className="btn-ghost" onClick={() => assets.pickUpload(field, card.title)}>
          本地上传
        </button>
        <button className="btn-ghost" onClick={() => assets.setHistFor({ field, title: card.title })}>
          历史生成
        </button>
        <button
          className="btn-ghost"
          disabled={act.busy}
          onClick={() => d.currentSkill(skillId) && act.runSkill(d.currentSkill(skillId)!, { focusName: card.title })}
        >
          从设定生成描述
        </button>
        <button
          className="btn"
          disabled={act.busy}
          onClick={() => d.currentSkill(skillId) && act.runSkill(d.currentSkill(skillId)!, { focusName: card.title })}
        >
          重新生成
        </button>
        <span className="ok">{card.body ? "已生成" : "待生成"}</span>
      </div>
    </article>
  );
}
