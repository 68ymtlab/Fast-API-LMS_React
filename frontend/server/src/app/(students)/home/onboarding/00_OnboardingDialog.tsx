"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import PageIntroduction from "./01_PageIntroduction";
import InitialPasswordChange from "./02_InitialPasswordChange";
import SystemOverview from "./03_SystemOverview";

const onboardingDialog = ({
	open_dialog,
	setOpenDialog,
}: {
	open_dialog: boolean;
	setOpenDialog: (open: boolean) => void;
}) => {
	const [step, setStep] = useState(0);

	const handleNext = useCallback(() => {
		setStep((prev) => prev + 1);
	}, []);
	const handlePrev = useCallback(
		() => setStep((prev) => Math.max(prev - 1, 0)),
		[],
	);

	const steps = useMemo(
		() => [
			{
				id: "intro",
				title: "ページの紹介",
				content: <PageIntroduction />,
			},
			{
				id: "password",
				title: "パスワード変更",
				content: (
					<InitialPasswordChange
						onSuccess={() => {
							setTimeout(() => handleNext(), 2000);
						}}
					/>
				),
				hideNextButton: true,
			},
			{
				id: "system",
				title: "システムの紹介",
				content: <SystemOverview />,
			},
		],
		[handleNext],
	);

	return (
		<Dialog open={open_dialog} onOpenChange={setOpenDialog}>
			<DialogContent className="!max-w-none w-[90vw] max-h-[95vh] overflow-y-auto rounded-xl bg-gradient-to-br from-slate-50 to-white shadow-2xl p-8 border border-slate-200">
				{/* ステップインジケーター */}
				<div className="flex items-center justify-between mb-8 relative">
					{steps.map((s, index) => (
						<div
							key={s.id}
							className="flex-1 flex flex-col items-center relative"
						>
							<div
								className={`w-9 h-9 flex items-center justify-center rounded-full text-white text-sm font-bold z-10 transition-all ${
									step === index
										? "bg-blue-600 scale-110 shadow-lg"
										: "bg-gray-300"
								}`}
							>
								{index + 1}
							</div>
							<span
								className={`mt-2 text-sm font-medium ${
									step === index ? "text-blue-700" : "text-gray-500"
								}`}
							>
								{s.title}
							</span>
							{index < steps.length - 1 && (
								<div className="absolute top-[18px] left-1/2 w-full h-1 bg-gray-300 -z-10">
									<div
										className={`h-full bg-blue-500 transition-all duration-500 ${
											step > index ? "w-full" : "w-0"
										}`}
									/>
								</div>
							)}
						</div>
					))}
				</div>

				{/* 本文 */}
				<Card className="bg-white/80 border border-gray-200 backdrop-blur-md shadow-lg rounded-lg">
					<div className="p-10">{steps[step].content}</div>
				</Card>

				{/* フッターボタン */}
				<div className="flex justify-between mt-8">
					{step > 0 ? (
						<Button
							variant="ghost"
							onClick={handlePrev}
							className="rounded-full px-6 py-2 text-gray-700 hover:bg-gray-100"
						>
							← 戻る
						</Button>
					) : (
						<div />
					)}

					{!steps[step].hideNextButton && (
						<Button
							onClick={() => {
								if (step === steps.length - 1) {
									setOpenDialog(false);
								} else {
									handleNext();
								}
							}}
							className="rounded-full px-6 py-2 bg-blue-600 text-white hover:bg-blue-700"
						>
							{step === steps.length - 1 ? "完了" : "次へ →"}
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};

export default onboardingDialog;
