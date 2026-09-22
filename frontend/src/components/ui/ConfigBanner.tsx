import { Link } from "react-router-dom";
import { useAppState } from "../../app-state";

export default function ConfigBanner() {
  const { configured } = useAppState();
  if (configured) return null;
  return (
    <div className="banner">
      还没有接入可用的供应商。请到 <Link to="/settings">设置</Link> 添加一家并启用。
    </div>
  );
}
