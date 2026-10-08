/**
 * What each role is told before it starts: a handful of plain steps, in
 * English and Chinese. The Chinese keeps the English names of roles, keys
 * and buttons, because those are what the screens show.
 */
import type { Role } from "@/lib/pipeline/types";

export type Language = "en" | "zh";

export const LANGUAGES: readonly Language[] = ["en", "zh"];

/** How long the instructions must be up before Start can be pressed. */
export const READ_SECONDS = 3;

interface Instructions {
  /** The language's own name, for the button that switches to it. */
  name: string;
  /** For the `lang` attribute, so each script gets its own fonts. */
  locale: string;
  intro: string;
  start: string;
  joining: string;
  roles: Record<Role, { title: string; steps: string[] }>;
}

export const INSTRUCTIONS: Record<Language, Instructions> = {
  en: {
    name: "English",
    locale: "en",
    intro: "Read this before you start.",
    start: "Start",
    joining: "Joining…",
    roles: {
      puller: {
        title: "You are the Puller",
        steps: [
          "Find the tube your screen asks for: the freezer box, the position, and the original ID on the tube.",
          "Hand it to the Aliquoter.",
          "Press Space, or tap “Pulled”. The screen moves to the next tube.",
          "When the Aliquoter hands a tube back, put it back in its place in the freezer. Then press Enter, or tap “Returned”, to confirm.",
        ],
      },
      labeler: {
        title: "You are the Labeler",
        steps: [
          "Find the three labels shown on your screen.",
          "Stick them on three empty tubes, one label each.",
          "Then tell the screen, one of two ways. With the camera: tap “Start camera” and scan each tube; after the third, the screen moves on by itself. Without it: press Space when all three labels are on.",
          "Hand the three tubes to the Aliquoter, then do the next one.",
        ],
      },
      aliquoter: {
        title: "You are the Aliquoter",
        steps: [
          "Take the source tube from the Puller. Check that the ID on it matches the big number on your screen, and that the labels on the three new tubes match the “New ID” below it.",
          "Aliquot it into its three labeled tubes. If one cannot be filled, tap that tube on your screen before you scan.",
          "Tap “Start camera”, then scan one of the three tubes. All three go in the same slot, each in its own box: the screen shows the slot and the boxes. Scanning the others is not needed.",
          "Put the tubes away, and hand the source tube back to the Puller. The screen has already moved to the next tube.",
          "Working alone, with no Puller or Labeler? Pull the tube and stick on its labels yourself, then scan one of its tubes as above. Go in any order: the scan counts the sample as pulled and labeled.",
        ],
      },
      overview: {
        title: "You are on Overview",
        steps: [
          "Watch the batch. Each square is one sample, colored by how far along it is.",
          "Tap a square to see its details or to fix a mistake.",
          "You do not handle tubes.",
        ],
      },
    },
  },
  zh: {
    name: "中文",
    locale: "zh-CN",
    intro: "开始前请先读完下面的说明。",
    start: "开始",
    joining: "正在加入…",
    roles: {
      puller: {
        title: "你是取管员（Puller）",
        steps: [
          "按屏幕提示找到样本管：冻存盒、位置，以及管上的原始编号。",
          "把它交给分装员（Aliquoter）。",
          "按空格键，或点 “Pulled”。屏幕会跳到下一管。",
          "分装员把管子还回来后，放回冰箱里原来的位置，再按回车键（Enter）或点 “Returned” 确认。",
        ],
      },
      labeler: {
        title: "你是贴标员（Labeler）",
        steps: [
          "找到屏幕上显示的三张标签。",
          "贴到三支空管上，每支一张。",
          "然后告诉屏幕已经贴好，两种方式任选其一。用摄像头：点 “Start camera”，逐支扫描，扫完第三支屏幕会自动跳到下一个。不用摄像头：三张都贴好后按空格键。",
          "把三支管交给分装员（Aliquoter），然后继续下一个。",
        ],
      },
      aliquoter: {
        title: "你是分装员（Aliquoter）",
        steps: [
          "从取管员（Puller）手里接过样本管，核对管上的编号和屏幕上的大号数字是否一致，并核对三支新管的标签和下方的 “New ID” 是否一致。",
          "把样本分装到对应的三支已贴标签的管里。如果有一支装不了，扫描前先在屏幕上点一下那支管。",
          "点 “Start camera”，扫描三支管中的任意一支。三支管放在同一个位置，各放进自己的盒子：屏幕会显示这个位置和三个盒子。另外两支不用再扫。",
          "把管子放好，再把样本管还给取管员。屏幕已经跳到下一管。",
          "如果只有你一个人，没有取管员（Puller）和贴标员（Labeler）：自己取出样本管、贴好标签，然后照上面的步骤扫描其中一支。顺序不限：扫描会把这个样本记为已取管、已贴标。",
        ],
      },
      overview: {
        title: "你是总览（Overview）",
        steps: [
          "查看本批进度。每个格子是一个样本，颜色表示它进行到哪一步。",
          "点格子可以查看详情或纠正错误。",
          "你不需要经手管子。",
        ],
      },
    },
  },
};
