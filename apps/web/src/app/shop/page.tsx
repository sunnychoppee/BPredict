import { AppShell } from "@/components/app-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function ShopPage() {
  return (
    <AppShell>
      <ComingSoon
        title="商店"
        icon="🪙"
        phase="W4"
        blurb="金幣與寶石僅供遊戲內使用，不可提現、不可兌換任何實物或虛擬貨幣。支援 USDT（TRC20 / ERC20 / BEP20）與信用卡。"
        items={[
          { name: "金幣包", desc: "1 USDT ＝ 10,000 金幣起；大包加贈 5–20%。" },
          { name: "VIP 月卡", desc: "單局上限提升至 1,000,000、專屬籌碼皮膚、每日額外補給。" },
          { name: "寶石", desc: "用於頭像框、桌布、籌碼皮膚等外觀道具。" },
          { name: "首儲禮包", desc: "首次儲值雙倍金幣，限一次。" },
        ]}
      />
    </AppShell>
  );
}
