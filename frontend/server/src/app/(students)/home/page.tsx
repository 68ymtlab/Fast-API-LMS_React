"use client";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import withAuth from "@/hocs/withAuth";
import { useAuth } from "@/hooks/useAuth";
import axios from "@/lib/axios";
import {
  BarChart,
  BarChart2,
  Book,
  BookOpen,
  Calendar,
  Clock,
  Crown,
  FileText,
  List,
  LogIn,
  Play,
  Star,
  Target,
  Trash2,
  Trophy,
  User,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface Course {
  course_id: number;
  course_name: string;
  subject_name: string;
  period: string;
}

interface Goal {
  goal_id: number;
  details: string;
  completed: boolean;
}

interface Subject {
  id: number;
  title: string;
  course: string;
  term: string;
  completedLessons: number;
  totalLessons: number;
}

interface HighPointer {
  mail: string;
  point: number;
}

export const StudentHome = () => {
  const { logout } = useAuth();
  const [username, setUsername] = useState("");
  const [point, setPoint] = useState("0");
  const [loginNum, setLoginNum] = useState(0);
  const [progress, setProgress] = useState(0);
  const [goal_set_dialog, set_goal_dialog] = useState(false);
  const [complete_dialog, setComplete] = useState(false);
  const [point_list_dialog, setPointListDialog] = useState(false);
  const [ranking_dialog, setRankingDialog] = useState(false);
  const [newGoal, setNewGoal] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [completeGoals, setCompleteGoals] = useState<Goal[]>([]);
  const [highPointers, setHighPointers] = useState<HighPointer[]>([]);
  const [userRank, setUserRank] = useState<number>(0);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [user_stats_dialog, setUserStatsDialog] = useState(false);

  const pointItems = [
    { id: 1, title: "ログイン", points: 1, icon: <LogIn className="w-5 h-5 text-secondary" /> },
    { id: 2, title: "目標を設定", points: 3, icon: <Target className="w-5 h-5 text-secondary" /> },
    { id: 3, title: "演習問題を解く", points: 10, icon: <BookOpen className="w-5 h-5 text-secondary" /> },
    { id: 4, title: "累計10日ログイン", points: 10, icon: <Calendar className="w-5 h-5 text-secondary" /> },
  ];

  const fetchProgress = useCallback(async () => {
    try {
      const coursesResponse = await axios.get("/get_courses");
      const courseIds = coursesResponse.data.map((course: Course) => course.course_id);

      const progressPromises = courseIds.map((courseId: number) => axios.get(`/get_progress/${courseId}`));

      const progressResponses = await Promise.all(progressPromises);
      const progresses = progressResponses.map((response) => response.data);

      if (progresses.length > 0) {
        const total = progresses.reduce((sum, score) => sum + score, 0);
        const average = Number.parseFloat((total / progresses.length).toFixed(2));
        setProgress(average);
      } else {
        setProgress(0);
      }
    } catch (error) {
      console.error("進捗の取得に失敗しました:", error);
    }
  }, []);

  useEffect(() => {
    axios
      .get("/get_courses")
      .then((res) => {
        if (res.status === 200) {
          const courses: Course[] = res.data;
          const formattedSubjects: Subject[] = courses.map((course) => ({
            id: course.course_id,
            title: course.subject_name,
            course: course.course_name,
            term: course.period,
            completedLessons: 0,
            totalLessons: 15,
          }));
          setSubjects(formattedSubjects);
        }
      })
      .catch((error) => {
        console.error("コースの取得に失敗しました:", error);
      });

    axios
      .get("/get_goal")
      .then((res) => {
        if (res.status === 200) {
          const goalsData: Goal[] = res.data;
          const uncompletedGoals = goalsData.filter((goal) => !goal.completed);
          const completedGoals = goalsData.filter((goal) => goal.completed);
          setGoals(uncompletedGoals);
          setCompleteGoals(completedGoals);
        }
      })
      .catch((error) => {
        console.error("目標の取得に失敗しました:", error);
      });

    axios
      .get("/get_point")
      .then((res) => {
        if (res.status === 200) {
          setPoint(res.data?.toString());
        }
      })
      .catch((error) => {
        console.error("ポイントの取得に失敗しました:", error);
      });

    axios
      .get("/user_name")
      .then((res) => {
        if (res.status === 200) {
          setUsername(res.data);
        }
      })
      .catch((error) => {
        console.error("ユーザー名の取得に失敗しました:", error);
      });

    // ハイスコアの取得
    axios
      .get("/get_high_pointer")
      .then((res) => {
        if (res.status === 200) {
          const pointers: HighPointer[] = res.data;
          setHighPointers(pointers);
          // ユーザーの順位を計算
          const rank = pointers.findIndex((p) => p.mail === username) + 1;
          setUserRank(rank);
        }
      })
      .catch((error) => {
        console.error("ハイスコアの取得に失敗しました:", error);
      });

    // ログイン日数の取得
    axios
      .post("/login_num")
      .then((res) => {
        if (res.status === 200) {
          setLoginNum(res.data);
        }
      })
      .catch((error) => {
        console.error("ログイン日数の取得に失敗しました:", error);
      });

    fetchProgress();
  }, [username, fetchProgress]);

  const onClickGoal = () => {
    set_goal_dialog(true);
  };
  const onClickComplete = () => {
    setComplete(true);
  };

  const handleAddGoal = () => {
    if (newGoal.trim() === "") {
      return;
    }

    axios
      .post("/add_goal", {
        details: newGoal,
      })
      .then((res) => {
        if (res.status === 200) {
          // 新しい目標を追加
          const newGoalData: Goal = {
            goal_id: res.data.goal_id,
            details: newGoal,
            completed: false,
          };
          setGoals([...goals, newGoalData]);
          setNewGoal("");
          set_goal_dialog(false);
        }
      })
      .catch((error) => {
        console.error("目標の追加に失敗しました:", error);
      });
  };

  const handleToggleCompleted = (goalId: number, currentCompleted: boolean) => {
    axios
      .post("/toggle_completed", {
        goal_id: goalId,
        completed: !currentCompleted,
      })
      .then((res) => {
        if (res.status === 200) {
          // 現在の目標リストを結合
          const allGoals = [...goals, ...completeGoals];

          // 目標の状態を更新
          const updatedGoals = allGoals.map((goal) => {
            if (goal.goal_id === goalId) {
              return { ...goal, completed: !currentCompleted };
            }
            return goal;
          });

          // 完了/未完了の目標を振り分け
          const uncompletedGoals = updatedGoals.filter((goal) => !goal.completed);
          const completedGoals = updatedGoals.filter((goal) => goal.completed);

          setGoals(uncompletedGoals);
          setCompleteGoals(completedGoals);
        }
      })
      .catch((error) => {
        console.error("目標の状態更新に失敗しました:", error);
      });
  };

  const handleDeleteGoal = (goalId: number) => {
    axios
      .delete("/delete_goal", {
        data: { goal_id: goalId },
      })
      .then((res) => {
        if (res.status === 200) {
          // 目標を削除
          const updatedGoals = goals.filter((goal) => goal.goal_id !== goalId);
          const updatedCompleteGoals = completeGoals.filter((goal) => goal.goal_id !== goalId);

          setGoals(updatedGoals);
          setCompleteGoals(updatedCompleteGoals);
        }
      })
      .catch((error) => {
        console.error("目標の削除に失敗しました:", error);
      });
  };

  return (
    <>
      <main>
        <div className="flex flex-col items-start justify-start min-h-screen bg-gray-100 pt-20">
          <div className="container mx-auto px-8 py-8 max-w-7xl">
            <div className="flex gap-8 w-full">
              <div className="flex-1">
                <div className="bg-[#f9f9f9] rounded-[12px] shadow-md p-8">
                  <div className="flex items-center justify-around gap-10">
                    <div className="w-20 h-18 bg-gray-200 rounded-full flex items-center justify-center">
                      <User className="w-16 h-16 text-secondary" />
                    </div>
                    <p className="text-3xl font-bold text-gray-800">{username}</p>
                    <div className="flex justify-end gap-8">
                      <div className="flex items-center gap-2">
                        <Star className="w-6 h-6 text-secondary" />
                        <span className="text-xl font-semibold text-gray-800">{point}pt</span>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger onClick={() => setPointListDialog(true)}>
                            <List className="w-6 h-6 text-secondary" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>ポイントリスト</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger onClick={() => setRankingDialog(true)}>
                            <Crown className="w-6 h-6 text-secondary" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>ポイントランキング</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger onClick={() => setUserStatsDialog(true)}>
                            <BarChart2 className="w-6 h-6 text-secondary" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>学習進捗</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex flex-row gap-4 w-full">
                    <Button
                      className="flex-1 h-12 text-xl font-bold flex items-center justify-center gap-2"
                      onClick={onClickComplete}
                    >
                      <Trophy className="w-8 h-8" />
                      達成した目標
                    </Button>
                    <Button
                      className="flex-1 h-12 text-xl font-bold flex items-center justify-center gap-2"
                      onClick={onClickGoal}
                    >
                      <Target className="w-8 h-8" />
                      目標を設定
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex-1">
                <div className="bg-white rounded-lg shadow-md p-6 h-[210px]">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-secondary" />
                    設定した目標
                  </h2>
                  <div className="space-y-2 h-[calc(200px-4rem)] overflow-y-auto pr-2">
                    {goals && goals.length > 0 ? (
                      goals.map((goal) => (
                        <div
                          key={goal.goal_id}
                          className="flex items-center justify-between p-3 bg-secondary/5 rounded-lg border border-secondary/10 hover:bg-secondary/10 transition-all duration-200"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-secondary/10 rounded-full">
                              <Target className="w-4 h-4 text-secondary" />
                            </div>
                            <span className="font-medium text-gray-800">{goal.details}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-gray-400 hover:text-secondary hover:bg-secondary/10 h-8 w-8 transition-colors duration-200"
                                    onClick={() => handleToggleCompleted(goal.goal_id, goal.completed)}
                                  >
                                    <Trophy className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>目標達成へ</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-gray-400 hover:text-red-500 hover:bg-red-50 h-8 w-8 transition-colors duration-200"
                                    onClick={() => handleDeleteGoal(goal.goal_id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>目標を削除</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full">
                        <div className="flex flex-col items-center gap-2">
                          <Target className="w-10 h-10 text-secondary/30" />
                          <p className="text-gray-500">目標が設定されていません</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-bold mb-6">学習科目一覧</h2>
              <div className="grid grid-cols-2 gap-6">
                {subjects.map((subject) => (
                  <Card key={subject.id}>
                    <CardHeader>
                      <div className="flex items-center gap-4">
                        <Book className="w-10 h-10 text-secondary" />
                        <div>
                          <CardTitle className="text-xl">{subject.title}</CardTitle>
                          <div className="text-sm text-gray-500 mt-2">
                            <span className="text-base">{subject.course}</span>
                            <span className="mx-2">|</span>
                            <span className="text-base">{subject.term}</span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 text-lg">完了レッスン</span>
                          <span className="font-medium text-lg">
                            {subject.completedLessons}/{subject.totalLessons}
                          </span>
                        </div>
                        <div className="w-full h-3 bg-gray-200 rounded-full mt-2">
                          <div
                            className="h-full rounded-full bg-secondary"
                            style={{ width: `${(subject.completedLessons / subject.totalLessons) * 100}%` }}
                          />
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex gap-3">
                      <Button className="flex-1 h-11" variant="default">
                        <Play className="w-5 h-5 mr-2" />
                        学習を始める
                      </Button>
                      <Button className="flex-1 h-11" variant="outline">
                        <BarChart className="w-5 h-5 mr-2" />
                        学習状況照会
                      </Button>
                      <Button className="flex-1 h-11" variant="outline">
                        <FileText className="w-5 h-5 mr-2" />
                        シラバス情報
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </div>
            <Button onClick={logout} className="mt-4">
              ログアウト
            </Button>
            <ThemeSwitcher />
          </div>
        </div>
      </main>

      <Dialog open={goal_set_dialog} onOpenChange={set_goal_dialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新しい目標を設定</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="目標を入力してください"
              value={newGoal}
              onChange={(e) => setNewGoal(e.target.value)}
              className="w-full"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                set_goal_dialog(false);
              }}
            >
              キャンセル
            </Button>
            <Button onClick={handleAddGoal}>設定する</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={complete_dialog} onOpenChange={setComplete}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="w-6 h-6 text-secondary" />
              達成した目標
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {completeGoals && completeGoals.length > 0 ? (
              completeGoals.map((goal) => (
                <div
                  key={goal.goal_id}
                  className="flex items-center justify-between p-4 bg-secondary/5 rounded-lg border border-secondary/10 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-secondary/10 rounded-full">
                      <Trophy className="w-5 h-5 text-secondary" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-800 text-lg">{goal.details}</span>
                      <span className="text-sm text-secondary">達成済み</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-gray-400 hover:text-red-500 hover:bg-red-50 h-8 w-8 transition-colors duration-200"
                            onClick={() => handleDeleteGoal(goal.goal_id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>目標を削除</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <div className="flex flex-col items-center gap-3">
                  <Trophy className="w-12 h-12 text-secondary/30" />
                  <p className="text-gray-500 text-lg">達成した目標はありません</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComplete(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={point_list_dialog} onOpenChange={setPointListDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Star className="w-5 h-5 text-secondary" />
              ポイントリスト
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              {pointItems.map((item) => (
                <div
                  key={`point-item-${item.id}`}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-all duration-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-secondary/10 rounded-lg ring-1 ring-secondary/20">{item.icon}</div>
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-800">{item.title}</span>
                      <span className="text-xs text-gray-500">獲得可能なポイント</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-lg font-bold text-secondary">+{item.points}</span>
                    <span className="text-sm text-secondary">pt</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between p-3 bg-secondary/5 rounded-lg">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-secondary" />
                  <span className="font-medium text-gray-800">現在のポイント</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-lg font-bold text-secondary">{point}</span>
                  <span className="text-sm text-secondary">pt</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPointListDialog(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ranking_dialog} onOpenChange={setRankingDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Crown className="w-6 h-6 text-secondary" />
              ポイントランキング
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center gap-4 p-6 bg-secondary/5 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                  <Crown className="w-6 h-6 text-secondary" />
                </div>
                <div className="flex flex-col">
                  <div className="text-lg font-medium text-gray-600">あなたの順位</div>
                  <div className="text-3xl font-bold text-secondary">#{userRank}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                  <Star className="w-6 h-6 text-secondary" />
                </div>
                <div className="flex flex-col">
                  <div className="text-lg font-medium text-gray-600">獲得ポイント</div>
                  <div className="text-3xl font-bold text-secondary">{point}pt</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="text-lg font-medium text-gray-600" />
            </div>
            <div className="w-[300px] flex flex-col items-center gap-1">
              <div className="w-2/5 flex items-center justify-between p-2 bg-yellow-100 rounded-lg">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-yellow-600" />
                  <span className="font-medium text-yellow-800">S</span>
                </div>
                <span className="text-xs text-yellow-800">500pt以上</span>
              </div>
              <div className="w-3/5 flex items-center justify-between p-2 bg-purple-100 rounded-lg">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-purple-600" />
                  <span className="font-medium text-purple-800">A</span>
                </div>
                <span className="text-xs text-purple-800">200pt以上</span>
              </div>
              <div className="w-4/5 flex items-center justify-between p-2 bg-blue-100 rounded-lg">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-800">B</span>
                </div>
                <span className="text-xs text-blue-800">100pt以上</span>
              </div>
              <div className="w-11/12 flex items-center justify-between p-2 bg-green-100 rounded-lg">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-green-800">C</span>
                </div>
                <span className="text-xs text-green-800">50pt以上</span>
              </div>
              <div className="w-full flex items-center justify-between p-2 bg-secondary/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-secondary" />
                  <span className="font-medium text-gray-800">D</span>
                </div>
                <span className="text-xs text-gray-800">20pt以下</span>
              </div>
            </div>
            <div className="w-full p-3 bg-secondary/5 rounded-lg">
              <div className="text-center text-sm text-gray-600">
                あなたは
                <span className="font-bold text-secondary mx-1">
                  {Number(point) >= 500
                    ? "S"
                    : Number(point) >= 200
                      ? "A"
                      : Number(point) >= 100
                        ? "B"
                        : Number(point) >= 50
                          ? "C"
                          : "D"}
                </span>
                ランクです
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRankingDialog(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={user_stats_dialog} onOpenChange={setUserStatsDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-secondary" />
              学習進捗
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center gap-2 p-4 bg-secondary/5 rounded-lg">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-secondary" />
                <span className="font-medium text-gray-600">ログイン日数</span>
              </div>
              <span className="text-2xl font-bold text-secondary">{loginNum}日</span>
            </div>
            <div className="p-4 bg-secondary/5 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-5 h-5 text-secondary" />
                <span className="font-medium text-gray-600">学習進捗率</span>
              </div>
              <div className="w-full h-4 bg-gray-200 rounded-full">
                <div className="h-full rounded-full bg-secondary" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="text-right mt-1">
              <span className="text-sm font-medium text-secondary">{progress}%</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserStatsDialog(false)}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default withAuth(StudentHome);
