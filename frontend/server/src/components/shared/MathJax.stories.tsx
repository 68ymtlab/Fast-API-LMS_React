// src/components/shared/MathJax.stories.tsx (例)
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { MathJax, MathJaxSetup } from "./MathJax"; // MathJax.tsx からインポート

const meta: Meta<typeof MathJax> = {
  title: "Shared/MathJax", // Storybookでの表示名
  component: MathJax,
  decorators: [
    (Story) => (
      <MathJaxSetup>
        {" "}
        {/* MathJaxのセットアップが必要な場合 */}
        <Story />
      </MathJaxSetup>
    ),
  ],
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    text: { control: "text", description: "表示する数式テキスト" },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    text: "$\\frac{1}{2}$ $\\displaystyle\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$",
  },
};

export const InlineMath: Story = {
  args: {
    text: "これはインライン数式 $a^2 + b^2 = c^2$ です。",
  },
};

export const DisplayMath: Story = {
  args: {
    text: "これはディスプレイ数式です。\n$$\n\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}\n$$",
  },
};

// MarkdownMathJax.tsx のようなテキストエリアでのインタラクティブなテストを再現したい場合
const InteractiveMathJax = () => {
  const [input, setInput] = useState("$\\frac{1}{2}$ $\\displaystyle\\sum_{2}^{2}1$");
  return (
    <div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={5}
        style={{ width: "100%", marginBottom: "10px", fontFamily: "monospace" }}
      />
      <MathJax text={input} />
    </div>
  );
};

export const Interactive: Story = {
  render: () => <InteractiveMathJax />,
  name: "Interactive Input",
};
