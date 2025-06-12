"use client";
import { TeacherHeader } from "@/components/atoms/layout/TeacherHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import withAuth from "@/hocs/withAuth";
import axios from "@/lib/axios";
import { BarChart2, Edit, Eye, Loader2 } from "lucide-react";
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

// 週選択カードコンポーネント
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
}) => {
  const [loadingButtons, setLoadingButtons] = useState<{ [key: string]: boolean }>({});

  const handleButtonClick = async (buttonId: string, callback: () => Promise<void> | void) => {
    setLoadingButtons((prev) => ({ ...prev, [buttonId]: true }));
    try {
      await callback();
    } finally {
      setTimeout(() => {
        setLoadingButtons((prev) => ({ ...prev, [buttonId]: false }));
      }, 500);
    }
  };

  return (
    <Card className="h-full hover:shadow-lg transition-shadow duration-200 border border-gray-100">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
            第{week.week_num}回
          </div>
        </div>
        <h3 className="text-lg font-semibold mb-4 text-gray-800">{week.week_name}</h3>

        {contents.length > 0 && (
          <div className="space-y-2 mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">コンテンツ:</h4>
            {contents.map((content) => (
              <div
                key={content.content_id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm hover:bg-gray-100 transition-colors duration-200"
              >
                <span className="text-gray-700">{content.content_name}</span>
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() =>
                      handleButtonClick(`preview-content-${content.content_id}`, () =>
                        onMoveWeek(content.content_id, true),
                      )
                    }
                    className="text-xs bg-primary text-white hover:bg-primary/90"
                    disabled={loadingButtons[`preview-content-${content.content_id}`]}
                  >
                    {loadingButtons[`preview-content-${content.content_id}`] ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <Eye className="w-3 h-3 mr-1" />
                        プレビュー
                      </>
                    )}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() =>
                      handleButtonClick(`edit-content-${content.content_id}`, () =>
                        onMoveWeek(content.content_id, true),
                      )
                    }
                    className="text-xs bg-primary text-white hover:bg-primary/90"
                    disabled={loadingButtons[`edit-content-${content.content_id}`]}
                  >
                    {loadingButtons[`edit-content-${content.content_id}`] ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <>
                        <Edit className="w-3 h-3 mr-1" />
                        編集
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex space-x-2 mt-4">
          <Button
            variant="default"
            onClick={() => handleButtonClick(`preview-${week.week_id}`, () => onMoveWeek(week.week_id))}
            className="flex-1 bg-primary text-white hover:bg-primary/90 font-medium py-2 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
            disabled={loadingButtons[`preview-${week.week_id}`]}
          >
            {loadingButtons[`preview-${week.week_id}`] ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Eye className="w-4 h-4" />
                プレビュー
              </>
            )}
          </Button>
          <Button
            variant="default"
            onClick={() => handleButtonClick(`edit-${week.week_id}`, () => onMoveWeek(week.week_id))}
            className="flex-1 bg-primary text-white hover:bg-primary/90 font-medium py-2 rounded-xl transition-shadow hover:shadow-xl text-sm flex items-center justify-center gap-2"
            disabled={loadingButtons[`edit-${week.week_id}`]}
          >
            {loadingButtons[`edit-${week.week_id}`] ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Edit className="w-4 h-4" />
                編集
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleButtonClick(`status-${week.week_id}`, () => onMoveFlow(week.week_id))}
            className="flex-1 border-primary/20 text-primary hover:bg-primary/5 font-medium py-2 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
            disabled={loadingButtons[`status-${week.week_id}`]}
          >
            {loadingButtons[`status-${week.week_id}`] ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <BarChart2 className="w-4 h-4" />
                学習状況
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// 週選択テーブルコンポーネント
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
}) => {
  const [loadingButtons, setLoadingButtons] = useState<{ [key: string]: boolean }>({});

  const handleButtonClick = async (buttonId: string, callback: () => Promise<void> | void) => {
    setLoadingButtons((prev) => ({ ...prev, [buttonId]: true }));
    try {
      await callback();
    } finally {
      setTimeout(() => {
        setLoadingButtons((prev) => ({ ...prev, [buttonId]: false }));
      }, 500);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto relative">
        <table className="w-full table-layout-fixed">
          <colgroup>
            <col className="w-1/5" />
            <col className="w-2/5" />
            <col className="w-1/5" />
            <col className="w-1/5" />
            <col className="w-1/5" />
          </colgroup>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GROUP</th>
              <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">内容</th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                プレビュー
              </th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                編集
              </th>
              <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                学習状況
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
                    <tr className="bg-gray-50 hover:bg-gray-100 transition-colors duration-200">
                      <td className="p-0" colSpan={5}>
                        <button
                          type="button"
                          onClick={() => onToggleWeekNumber(weekNum)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onToggleWeekNumber(weekNum);
                            }
                          }}
                          className="w-full flex items-center space-x-2 px-6 py-4 text-left text-sm font-semibold text-primary whitespace-nowrap hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary cursor-pointer"
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

                    {isGroupExpanded &&
                      weeksInGroup.map((week) => {
                        const individualContents = contentsMap[week.week_id] || [];
                        individualContents.sort((a, b) => a.order - b.order);

                        return (
                          <React.Fragment key={week.week_id}>
                            <tr className="border-t bg-white hover:bg-gray-50 transition-colors duration-200">
                              <td className="pl-10 pr-6 py-4 text-sm text-gray-500" />
                              <td className="px-6 py-4 text-base font-medium text-gray-700">{week.week_name}</td>
                              <td className="px-6 py-4 text-center text-sm">
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleButtonClick(`preview-${week.week_id}`, () => onMoveWeek(week.week_id));
                                  }}
                                  className="bg-primary text-white hover:bg-primary/90"
                                  disabled={loadingButtons[`preview-${week.week_id}`]}
                                >
                                  {loadingButtons[`preview-${week.week_id}`] ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <>
                                      <Eye className="w-4 h-4 mr-1" />
                                      プレビュー
                                    </>
                                  )}
                                </Button>
                              </td>
                              <td className="px-6 py-4 text-center text-sm">
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleButtonClick(`edit-${week.week_id}`, () => onMoveWeek(week.week_id));
                                  }}
                                  className="bg-primary text-white hover:bg-primary/90"
                                  disabled={loadingButtons[`edit-${week.week_id}`]}
                                >
                                  {loadingButtons[`edit-${week.week_id}`] ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <>
                                      <Edit className="w-4 h-4 mr-1" />
                                      編集
                                    </>
                                  )}
                                </Button>
                              </td>
                              <td className="px-6 py-4 text-center text-sm">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleButtonClick(`status-${week.week_id}`, () => onMoveFlow(week.week_id));
                                  }}
                                  className="border-primary/20 text-primary hover:bg-primary/5"
                                  disabled={loadingButtons[`status-${week.week_id}`]}
                                >
                                  {loadingButtons[`status-${week.week_id}`] ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <>
                                      <BarChart2 className="w-4 h-4 mr-1" />
                                      学習状況
                                    </>
                                  )}
                                </Button>
                              </td>
                            </tr>

                            {individualContents.map((content) => (
                              <tr
                                key={content.content_id}
                                className="bg-gray-50 hover:bg-gray-100 transition-colors duration-200"
                              >
                                <td className="pl-10 pr-6 py-4 whitespace-nowrap text-sm text-gray-500" />
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                  {content.content_name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleButtonClick(`preview-content-${content.content_id}`, () =>
                                        onMoveWeek(content.content_id, true),
                                      );
                                    }}
                                    className="bg-primary text-white hover:bg-primary/90"
                                    disabled={loadingButtons[`preview-content-${content.content_id}`]}
                                  >
                                    {loadingButtons[`preview-content-${content.content_id}`] ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <>
                                        <Eye className="w-4 h-4 mr-1" />
                                        プレビュー
                                      </>
                                    )}
                                  </Button>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleButtonClick(`edit-content-${content.content_id}`, () =>
                                        onMoveWeek(content.content_id, true),
                                      );
                                    }}
                                    className="bg-primary text-white hover:bg-primary/90"
                                    disabled={loadingButtons[`edit-content-${content.content_id}`]}
                                  >
                                    {loadingButtons[`edit-content-${content.content_id}`] ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <>
                                        <Edit className="w-4 h-4 mr-1" />
                                        編集
                                      </>
                                    )}
                                  </Button>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">-</td>
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
};

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

    const homeProfile = () => {
      axios
        .get("/home_profile")
        .then((response) => {
          setUserInfo(response.data);
        })
        .catch((error) => {
          if (error.response?.status === 401) {
            setSessionError(true);
          } else {
            console.log(error.response);
          }
        });
    };

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

    homeProfile();
    getCourseInfo();
    getWeeksApi();
    getCourseContents();
  }, [course_id]);

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
    if (isContentId) {
      const targetContent = contents.find((c) => c.content_id === id);
      if (targetContent && course_id) {
        router.push(`/t/course/${course_id}/Week/${targetContent.week_id}/${id}`);
      } else {
        console.error(`Content with id ${id} not found or course_id missing.`);
      }
    } else {
      const weekId = id;
      const contentsInWeek = contentsMap[weekId];
      if (contentsInWeek && contentsInWeek.length > 0) {
        const sortedContents = [...contentsInWeek].sort((a, b) => a.order - b.order);
        const firstContent = sortedContents[0];
        if (firstContent && course_id) {
          router.push(`/t/course/${course_id}/Week/${weekId}/${firstContent.content_id}`);
        } else {
          console.error(`First content in week ${weekId} not found or course_id missing.`);
        }
      } else {
        console.log(`No contents found for week ${weekId}. Cannot start week learning.`);
      }
    }
  };

  const handleMoveFlow = (weekId: number) => {
    router.push(`/t/weekflows/${course_id}/${weekId}`);
  };

  if (sessionError) {
    return (
      <>
        <main className="pt-16">
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
        <main className="pt-16">
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
      <TeacherHeader />
      <main className="pt-16">
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
          <div className="container mx-auto px-4 py-8">
            <div className="max-w-6xl mx-auto">
              {course && (
                <div className="mb-8 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold text-primary">{course.subject_name}</h1>
                    <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">必修</span>
                    <span className="bg-purple-100 text-purple-800 text-sm font-medium px-3 py-1 rounded-full">
                      基礎
                    </span>
                  </div>
                  <h2 className="text-xl text-gray-600 mb-4">
                    {course.course_name} / {course.period}
                  </h2>
                  {course.course_description && (
                    <blockquote className="text-gray-600 mt-4 p-4 bg-gray-50 rounded-lg border-l-4 border-primary">
                      <p className="italic">{course.course_description}</p>
                    </blockquote>
                  )}
                </div>
              )}

              <div className="mb-6">
                <div className="flex items-center justify-end space-x-4">
                  <div className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm border border-gray-100">
                    <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <title>カード表示アイコン</title>
                      <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />
                    </svg>
                    <CustomSwitch checked={isCardView} onCheckedChange={setIsCardView} />
                    <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <title>リスト表示アイコン</title>
                      <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
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
                    <div className="col-span-full bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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

export default withAuth(CoursePage, ["教師"]);
