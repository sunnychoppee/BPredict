import { AppShell } from "@/components/app-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function LeaderboardPage() {
  return (
    <AppShell>
      <ComingSoon
        title="排行"
        icon="🏆"
        phase="W5"
        blurb="每日 / 每週淨勝與最長連勝榜，前三名獲得金框頭像與寶石獎勵。"
        items={[
          { name: "今日淨勝榜", desc: "00:00（UTC+8）重置，前 50 名上榜。" },
          { name: "本週淨勝榜", desc: "每週一重置，前 3 名獲得限定頭像框。" },
          { name: "連勝榜", desc: "歷史最長連勝，永久紀錄。" },
          { name: "好友榜", desc: "邀請好友同桌競技，互相比拼。" },
        ]}
      />
    </AppShell>
  );
}
