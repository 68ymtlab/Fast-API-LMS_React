"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import withAuth from "@/hocs/withAuth";
import axios from "@/lib/axios";
import { useParams, useRouter } from "next/navigation";
import React, { useState, useEffect } from "react";

interface UserInfo {
  id: number;
  name: string;
  email: string;
  username: string;
  kind_name: string;
}

interface Course {
  course_id: number;
  subject_name: string;
  course_name: string;
  period: string;
  course_description?: string;
  year: string;
  semester: string;
}

interface Week {
  week_id: number;
  week_name: string;
  week_num: number;
  order: number;
}

interface Content {
  content_id: number;
  content_name: string;
  week_id: number;
  order: number;
}

// カスタムスイッチコンポーネント
const CustomSwitch = ({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <label className="relative inline-flex items-center cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} className="sr-only" />
    <div className={`w-11 h-6 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-gray-300"}`}>
      <div
        className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        } mt-0.5 ml-0.5`}
      />
    </div>
  </label>
);

// 週選択カードコンポーネント（階層構造対応）
const WeekSelectCard = ({
  week,
  contents,
  onMoveWeek,
  onMoveFlow,
}: {
  week: Week;
  contents: Content[];
  onMoveWeek: (id: number, isContentId?: boolean) => void;
  onMoveFlow: (weekId: number) => void;
}) => (
  <Card className="h-full">
    <CardContent className="p-6">
      <h3 className="text-lg font-semibold mb-2">第{week.week_num}回</h3>
      <p className="text-gray-600 mb-4 text-sm">{week.week_name}</p>

      {contents.length > 0 && (
        <div className="space-y-2 mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">コンテンツ:</h4>
          {contents.map((content) => (
            <div key={content.content_id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
              <span className="text-gray-700">{content.content_name}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onMoveWeek(content.content_id, true)}
                className="text-xs"
              >
                学習を始める
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex space-x-2 mt-4">
        <Button variant="default" className="flex-1" onClick={() => onMoveWeek(week.week_id)}>
          学習を始める
        </Button>
        <Button variant="default" className="flex-1" onClick={() => onMoveFlow(week.week_id)}>
          演習問題
        </Button>
      </div>
    </CardContent>
  </Card>
);

// 週選択テーブルコンポーネント（階層構造対応）
const WeekSelectTable = ({
  groupedWeeks,
  contentsMap,
  expandedWeekNumbers,
  onToggleWeekNumber,
  onMoveWeek,
  onMoveFlow,
}: {
  groupedWeeks: { [key: number]: Week[] };
  contentsMap: { [weekId: number]: Content[] };
  expandedWeekNumbers: Set<number>;
  onToggleWeekNumber: (weekNum: number) => void;
  onMoveWeek: (id: number, isContentId?: boolean) => void;
  onMoveFlow: (weekId: number) => void;
}) => (
  <div className="bg-white rounded-lg shadow-sm border">
    <div className="overflow-x-auto">
      <table className="w-full table-layout-fixed">
        <colgroup>
          <col className="w-1/5" />
          <col className="w-2/5" />
          <col className="w-1/5" />
          <col className="w-1/5" />
        </colgroup>
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">回</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">内容</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              教科書コンテンツ
            </th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              演習問題
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {Object.entries(groupedWeeks)
            .sort(([numA], [numB]) => Number.parseInt(numA) - Number.parseInt(numB))
            .map(([weekNumStr, weeksInGroup]) => {
              const weekNum = Number.parseInt(weekNumStr);
              const isGroupExpanded = expandedWeekNumbers.has(weekNum);

              return (
                <React.Fragment key={`group-${weekNum}`}>
                  {/* "第N回" ヘッダー行 */}
                  <tr className="bg-gray-100">
                    <td className="p-0" colSpan={4}>
                      <button
                        type="button"
                        onClick={() => onToggleWeekNumber(weekNum)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onToggleWeekNumber(weekNum);
                          }
                        }}
                        className="w-full flex items-center space-x-2 px-6 py-4 text-left text-sm font-semibold text-gray-800 whitespace-nowrap hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 cursor-pointer"
                      >
                        <svg
                          className={`w-5 h-5 transition-transform transform ${isGroupExpanded ? "rotate-90" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                        >
                          <title>開閉アイコン</title>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                        <span>第{weekNum}回</span>
                      </button>
                    </td>
                  </tr>

                  {/* この "第N回" に属する週のリスト */}
                  {isGroupExpanded &&
                    weeksInGroup.map((week) => {
                      const individualContents = contentsMap[week.week_id] || [];
                      individualContents.sort((a, b) => a.order - b.order);

                      return (
                        <React.Fragment key={week.week_id}>
                          {/* 週の名前 (例: "第1週コンテンツ") と週全体の演習問題 */}
                          <tr className="border-t bg-slate-50 hover:bg-slate-100">
                            <td className="pl-10 pr-6 py-3 text-sm text-gray-500">
                              {/* 1列目はインデントとして機能 */}
                            </td>
                            <td className="px-6 py-3 text-base font-medium text-gray-700">{week.week_name}</td>
                            <td className="px-6 py-3 text-center text-sm">
                              {" "}
                              {/* 学習を始めるボタン用のセル */}
                              <Button
                                variant="default"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMoveWeek(week.week_id);
                                }}
                              >
                                学習を始める
                              </Button>
                            </td>
                            <td className="px-6 py-3 text-center text-sm">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMoveFlow(week.week_id);
                                }}
                              >
                                演習問題
                              </Button>
                            </td>
                          </tr>

                          {/* この週に紐づく個別コンテンツ */}
                          {individualContents.map((content) => (
                            <tr key={content.content_id} className="bg-white hover:bg-gray-50">
                              <td className="pl-10 pr-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {/* 1列目はインデントとして機能 */}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                {content.content_name}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMoveWeek(content.content_id, true);
                                  }}
                                >
                                  学習を始める
                                </Button>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                                {/* 個別コンテンツの演習問題は通常週単位なので"-" */}-
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                </React.Fragment>
              );
            })}
        </tbody>
      </table>
    </div>
  </div>
);

export const CoursePage = () => {
  const params = useParams();
  const router = useRouter();
  const course_id = params.course_id as string;

  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCardView, setIsCardView] = useState(false);

  const [groupedWeeksByNum, setGroupedWeeksByNum] = useState<{ [key: number]: Week[] }>({});
  const [expandedWeekNumbers, setExpandedWeekNumbers] = useState<Set<number>>(new Set());

  // 週ごとのコンテンツマップを作成
  const contentsMap = contents.reduce(
    (acc, content) => {
      if (!acc[content.week_id]) {
        acc[content.week_id] = [];
      }
      acc[content.week_id].push(content);
      return acc;
    },
    {} as { [weekId: number]: Content[] },
  );

  useEffect(() => {
    if (!course_id) {
      setLoading(false);
      return;
    }

    const getCourseInfo = () => {
      axios
        .get(`/get_course_info/${course_id}`)
        .then((response) => {
          setCourse(response.data);
        })
        .catch((error) => {
          console.error("コース情報の取得に失敗しました:", error);
        });
    };

    const getWeeksApi = () => {
      axios
        .get(`/get_weeks/${course_id}`)
        .then((response) => {
          setWeeks(response.data);
        })
        .catch((error) => {
          console.error("週一覧の取得に失敗しました:", error);
        });
    };

    const getCourseContents = () => {
      axios
        .get(`/get_course_contents/${course_id}`)
        .then((response) => {
          setContents(response.data);
        })
        .catch((error) => {
          console.error("コンテンツ一覧の取得に失敗しました:", error);
        })
        .finally(() => {
          setLoading(false);
        });
    };

    getCourseInfo();
    getWeeksApi();
    getCourseContents();
  }, [course_id]);

  // `weeks` が更新されたら `week_num` でグループ化する
  useEffect(() => {
    if (weeks.length > 0) {
      const groups = weeks.reduce(
        (acc, week) => {
          const key = week.week_num;
          if (!acc[key]) {
            acc[key] = [];
          }
          acc[key].push(week);
          return acc;
        },
        {} as { [key: number]: Week[] },
      );

      // 各グループ内の週を `order` プロパティでソート
      for (const numKey in groups) {
        groups[numKey].sort((a, b) => a.order - b.order);
      }
      setGroupedWeeksByNum(groups);
    } else {
      setGroupedWeeksByNum({});
    }
  }, [weeks]);

  const handleToggleWeekNumber = (weekNum: number) => {
    const newExpanded = new Set(expandedWeekNumbers);
    if (newExpanded.has(weekNum)) {
      newExpanded.delete(weekNum);
    } else {
      newExpanded.add(weekNum);
    }
    setExpandedWeekNumbers(newExpanded);
  };

  const handleMoveWeek = (id: number, isContentId = false) => {
    // if (isContentId) {
    //   // 個別コンテンツIDが渡された場合、そのコンテンツページへ遷移
    //   const targetContent = contents.find((c) => c.content_id === id);
    //   if (targetContent && course_id) {
    //     router.push(`/Week/${targetContent.week_id}/${id}`);
    //   } else {
    //     console.error(`Content with id ${id} not found or course_id missing.`);
    //   }
    // } else {
    //   // 週IDが渡された場合、その週の最初のコンテンツページへ遷移
    //   const weekId = id;
    //   const contentsInWeek = contentsMap[weekId];
    //   if (contentsInWeek && contentsInWeek.length > 0) {
    //     // orderでソートして最初のコンテンツを取得 (すでにソートされている前提だが念のため)
    //     const sortedContents = [...contentsInWeek].sort((a, b) => a.order - b.order);
    //     const firstContent = sortedContents[0];
    //     if (firstContent && course_id) {
    //       router.push(`/${course_id}/Week/${weekId}/${firstContent.content_id}`);
    //     } else {
    //       console.error(`First content in week ${weekId} not found or course_id missing.`);
    //     }
    //   } else {
    //     console.log(`No contents found for week ${weekId}. Cannot start week learning.`);
    //     // ここでフォールバックとして週の演習問題ページに飛ばすなども可能
    //     // router.push(`/weekflows/${course_id}/${weekId}`);
    //   }
    // }
    router.push(`/lesson/${id}/1`);
  };

  const handleMoveFlow = (weekId: number) => {
    router.push(`/weekflows/${course_id}/${weekId}`);
  };

  if (sessionError) {
    return (
      <>
        <main>
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <div className="container mx-auto px-4 py-8">
              <h2 className="text-2xl font-bold text-red-600 mb-4">セッションエラー</h2>
              <p>ログインが必要です。</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <main>
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <div className="container mx-auto px-4 py-8">
              <p>読み込み中...</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <main>
        <div className="min-h-screen bg-gray-100">
          <div className="container mx-auto px-4 py-8">
            <div className="max-w-6xl mx-auto">
              {course && (
                <div className="mb-8">
                  <h1 className="text-3xl font-bold mb-2">{course.subject_name}</h1>
                  <h2 className="text-xl text-gray-600 mb-4">
                    {course.course_name} / {course.period}
                  </h2>
                </div>
              )}

              <div className="mb-6">
                <div className="flex items-center justify-end space-x-4">
                  <div className="flex items-center space-x-2">
                    <svg className="w-6 h-6 text-gray-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <title>リスト表示アイコン</title>
                      <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
                    </svg>
                    <CustomSwitch checked={isCardView} onCheckedChange={setIsCardView} />
                    <svg className="w-6 h-6 text-gray-600" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <title>カード表示アイコン</title>
                      <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />
                    </svg>
                  </div>
                </div>
              </div>

              {isCardView && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.entries(groupedWeeksByNum)
                    .sort(([numA], [numB]) => Number.parseInt(numA) - Number.parseInt(numB))
                    .flatMap(([weekNum, weeksInGroup]) =>
                      weeksInGroup.map((week) => (
                        <WeekSelectCard
                          key={week.week_id}
                          week={week}
                          contents={contentsMap[week.week_id] || []}
                          onMoveWeek={handleMoveWeek}
                          onMoveFlow={handleMoveFlow}
                        />
                      )),
                    ).length > 0 ? (
                    Object.entries(groupedWeeksByNum)
                      .sort(([numA], [numB]) => Number.parseInt(numA) - Number.parseInt(numB))
                      .flatMap(([weekNum, weeksInGroup]) =>
                        weeksInGroup.map((week) => (
                          <WeekSelectCard
                            key={week.week_id}
                            week={week}
                            contents={contentsMap[week.week_id] || []}
                            onMoveWeek={handleMoveWeek}
                            onMoveFlow={handleMoveFlow}
                          />
                        )),
                      )
                  ) : (
                    <div className="col-span-full bg-white rounded-lg shadow-sm border p-6">
                      <p className="text-center text-gray-500">このコースには週が設定されていません。</p>
                    </div>
                  )}
                </div>
              )}

              {!isCardView && (
                <WeekSelectTable
                  groupedWeeks={groupedWeeksByNum}
                  contentsMap={contentsMap}
                  expandedWeekNumbers={expandedWeekNumbers}
                  onToggleWeekNumber={handleToggleWeekNumber}
                  onMoveWeek={handleMoveWeek}
                  onMoveFlow={handleMoveFlow}
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

export default withAuth(CoursePage, ["学生", "テスト"]);
