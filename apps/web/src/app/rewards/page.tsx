import { AppShell } from "@/components/app-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function RewardsPage() {
  return (
    <AppShell>
      <ComingSoon
        title="獎勵"
        icon="🎁"
        phase="W4"
        blurb="每日簽到、定時補給、連勝加成與破產救濟，全部免費領取金幣。"
        items={[
          { name: "每日簽到", desc: "連續 7 天遞增：2,000 → 8,000 金幣，第 7 天額外送寶石。" },
          { name: "定時補給", desc: "每 4 小時領一次 1,000 金幣，上線就有得玩。" },
          { name: "連勝加成", desc: "3 連勝 +5%、5 連勝 +10%、10 連勝 +20%，從桌費撥出。" },
          { name: "救濟金", desc: "金幣低於 500 時，每日可領 1 次 3,000 金幣。" },
        ]}
      />
    </AppShell>
  );
}
