"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import axios from "@/lib/axios";
import { Paper, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Title, Tooltip } from "chart.js";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FC } from "react";
import { Bar } from "react-chartjs-2";

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const colors = [
  "#0000dd",
  "#dddd00",
  "#aa0000",
  "#008000",
  "#ffa500",
  "#800080",
  "#aa00aa",
  "#00ffff",
  "#98d98e",
  "#a59aca",
  "#762f07",
  "#bce2e8",
  "#928c36",
  "#f8b500",
  "#f6bfbc",
];

const ranges = [
  { min: 0, max: 15 },
  { min: 15, max: 30 },
  { min: 30, max: 45 },
  { min: 45, max: 60 },
  { min: 60, max: 75 },
  { min: 75, max: 90 },
  { min: 90, max: 101 },
];

interface ApiResponseData {
  [key: string]: Array<{
    [key: string]: Array<{
      flow_session_grade: number;
    }>;
  }>;
}

function extractGradesByExercise(data: ApiResponseData[]): Record<string, number[]> {
  const gradesByExercise: Record<string, number[]> = {};
  for (const content of data) {
    for (const exercises of Object.values(content)) {
      for (const exercise of exercises) {
        for (const exerciseName of Object.keys(exercise)) {
          const grades = exercise[exerciseName].map((item: { flow_session_grade: number }) => item.flow_session_grade);
          gradesByExercise[exerciseName] = grades;
        }
      }
    }
  }
  return gradesByExercise;
}

function calculateStatistics(grades: number[]) {
  if (!grades || grades.length === 0) {
    return { average: undefined, max: undefined, min: undefined, median: undefined, count: undefined };
  }
  const average = grades.reduce((acc, curr) => acc + curr, 0) / grades.length;
  const max = Math.max(...grades);
  const min = Math.min(...grades);
  const sortedGrades = [...grades].sort((a, b) => a - b);
  const middle = Math.floor(sortedGrades.length / 2);
  const median =
    sortedGrades.length % 2 === 0 ? (sortedGrades[middle - 1] + sortedGrades[middle]) / 2 : sortedGrades[middle];
  const count = grades.length;
  return { average, max, min, median, count };
}

function calculateRangeCounts(grades: number[]) {
  return ranges.map((range) => grades.filter((value) => value >= range.min && value < range.max).length);
}

const CourseScorePage: FC = () => {
  const params = useParams();
  const course_id = params?.course_id;
  const [apiResponseData, setApiResponseData] = useState<ApiResponseData[]>([]);
  const [showCheckboxes, setShowCheckboxes] = useState(false);
  const [exerciseList, setExerciseList] = useState<string[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [userInfo, setUserInfo] = useState<Record<string, unknown>>({});
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    const getTeacherScore = async () => {
      try {
        const response = await axios.get(`/get_flow_session_teacher_score/${course_id}`, { withCredentials: true });
        setApiResponseData(response.data);
      } catch (error: unknown) {
        console.error("学生の成績取得中にエラーが発生:", error);
      }
    };
    if (course_id) getTeacherScore();
  }, [course_id]);

  useEffect(() => {
    const homeProfile = async () => {
      try {
        const response = await axios.get("/home_profile", { withCredentials: true });
        setUserInfo(response.data);
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "Unauthorized") setSessionError(true);
        else console.log(error);
      }
    };
    homeProfile();
  }, []);

  const gradesByExercise = useMemo(() => extractGradesByExercise(apiResponseData), [apiResponseData]);

  useEffect(() => {
    setExerciseList(Object.keys(gradesByExercise));
  }, [gradesByExercise]);

  const exerciseStatistics = useMemo(() => {
    const stats: Record<string, ReturnType<typeof calculateStatistics>> = {};
    for (const exerciseName of Object.keys(gradesByExercise)) {
      stats[exerciseName] = calculateStatistics(gradesByExercise[exerciseName]);
    }
    return stats;
  }, [gradesByExercise]);

  const chartData = useMemo(() => {
    const datasets = Object.keys(gradesByExercise).map((exerciseName, index) => ({
      label: exerciseName,
      data: calculateRangeCounts(gradesByExercise[exerciseName]),
      backgroundColor: colors[index % colors.length],
      hoverBackgroundColor: "#ff9800",
    }));
    const filteredDatasets =
      selectedExercises.length > 0 ? datasets.filter((dataset) => selectedExercises.includes(dataset.label)) : datasets;
    return {
      labels: ["0〜15", "15〜30", "30〜45", "45〜60", "60〜75", "75〜90", "90〜100"],
      datasets: filteredDatasets,
    };
  }, [gradesByExercise, selectedExercises]);

  const chartOptions = {
    responsive: true,
    scales: {
      y: {
        suggestedMin: 0,
        suggestedMax: 30,
      },
    },
    plugins: {
      title: {
        display: true,
        text: "演習問題 成績分布",
        color: "black",
        position: "top" as const,
        align: "center" as const,
        font: {
          weight: 700,
          size: 30,
        },
        padding: 8,
        fullSize: true,
      },
    },
  };

  return (
    <div
      style={{
        padding: "0 40px",
        maxWidth: 1400,
        margin: "0 auto 48px auto",
        background: "#fff",
        borderRadius: 16,
        boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
      }}
    >
      <div style={{ margin: "16px 0 40px 0", maxWidth: "900px", width: "100%" }}>
        <Bar data={chartData} options={chartOptions} />
      </div>
      <div style={{ width: "100%", display: "flex", justifyContent: "center", marginBottom: 4 }}>
        <Button
          variant="outline"
          onClick={() => setShowCheckboxes((prev) => !prev)}
          className="px-6 py-2 font-medium text-sm rounded-md border-blue-500 text-blue-600 hover:bg-blue-50 min-w-[180px]"
        >
          表示する演習問題をフィルタリング
        </Button>
      </div>
      <div className="status-container" style={{ textAlign: "center", margin: "20px 0" }}>
        {selectedExercises.length > 0 && <span>選択中: {selectedExercises.join(", ")}</span>}
      </div>
      <Dialog open={showCheckboxes} onOpenChange={setShowCheckboxes}>
        <DialogContent className="max-w-6xl p-4">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-center text-lg font-bold text-gray-800">演習問題を選択</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-4 py-4">
            {exerciseList.map((exercise) => (
              <div
                key={exercise}
                className="flex items-center space-x-2 p-2 rounded hover:bg-gray-50 transition-colors min-w-0 group"
                title={exercise}
              >
                <Checkbox
                  id={`exercise-${exercise}`}
                  checked={selectedExercises.includes(exercise)}
                  onCheckedChange={(checked) => {
                    setSelectedExercises((prev) =>
                      checked ? [...prev, exercise] : prev.filter((ex) => ex !== exercise),
                    );
                  }}
                  className="h-4 w-4 flex-shrink-0"
                />
                <label htmlFor={`exercise-${exercise}`} className="text-sm font-medium text-gray-700 cursor-pointer truncate group-hover:text-blue-600">
                  {exercise}
                </label>
              </div>
            ))}
          </div>
          <DialogFooter className="mt-4 pt-3 border-t border-gray-200">
            <Button variant="outline" onClick={() => setShowCheckboxes(false)} className="px-4 py-1">
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Paper
          sx={{
            mt: 2,
            mb: 4,
            overflowX: "auto",
            width: "100%",
            maxWidth: 900,
            p: 2.5,
            borderRadius: 4,
            background: "linear-gradient(120deg, #fafdff 70%, #e3f0fa 100%)",
          }}
        >
          <Table className="tablec" sx={{ minWidth: 700, borderCollapse: "separate", borderSpacing: 0 }}>
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: "1.13rem",
                    padding: "18px 14px",
                    background: "#e3f0fa",
                    color: "#1976d2",
                    borderBottom: "3px solid #b6d4fa",
                    letterSpacing: 1,
                    borderTopLeftRadius: 10,
                  }}
                >
                  演習問題
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: "1.13rem",
                    padding: "18px 14px",
                    background: "#e3f0fa",
                    color: "#1976d2",
                    borderBottom: "3px solid #b6d4fa",
                    letterSpacing: 1,
                  }}
                >
                  平均値
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: "1.13rem",
                    padding: "18px 14px",
                    background: "#e3f0fa",
                    color: "#1976d2",
                    borderBottom: "3px solid #b6d4fa",
                    letterSpacing: 1,
                  }}
                >
                  最大値
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: "1.13rem",
                    padding: "18px 14px",
                    background: "#e3f0fa",
                    color: "#1976d2",
                    borderBottom: "3px solid #b6d4fa",
                    letterSpacing: 1,
                  }}
                >
                  最小値
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: "1.13rem",
                    padding: "18px 14px",
                    background: "#e3f0fa",
                    color: "#1976d2",
                    borderBottom: "3px solid #b6d4fa",
                    letterSpacing: 1,
                  }}
                >
                  中央値
                </TableCell>
                <TableCell
                  sx={{
                    fontWeight: 700,
                    fontSize: "1.13rem",
                    padding: "18px 14px",
                    background: "#e3f0fa",
                    color: "#1976d2",
                    borderBottom: "3px solid #b6d4fa",
                    letterSpacing: 1,
                    borderTopRightRadius: 10,
                  }}
                >
                  データ数
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(exerciseStatistics).map(([exerciseName, stats], idx) => (
                <TableRow
                  key={exerciseName}
                  sx={{
                    background: idx % 2 === 0 ? "#f3f8fd" : "#fff",
                    transition: "background 0.2s",
                    "&:hover": {
                      background: "#e3f0fa",
                    },
                  }}
                >
                  <TableCell
                    sx={{
                      padding: "15px 14px",
                      fontSize: "1.07rem",
                      fontWeight: 500,
                      borderBottom: "1.5px solid #e0e3e7",
                      borderRadius: 2,
                      background: "#fff",
                      boxShadow: "0 1px 4px rgba(66,165,245,0.03)",
                    }}
                  >
                    {exerciseName}
                  </TableCell>
                  <TableCell
                    sx={{
                      padding: "15px 14px",
                      fontSize: "1.07rem",
                      borderBottom: "1.5px solid #e0e3e7",
                      background: "#fff",
                      borderRadius: 2,
                      boxShadow: "0 1px 4px rgba(66,165,245,0.03)",
                    }}
                  >
                    {typeof stats.average === "number" && !Number.isNaN(stats.average) ? `${stats.average.toFixed(1)}%` : "-"}
                  </TableCell>
                  <TableCell
                    sx={{
                      padding: "15px 14px",
                      fontSize: "1.07rem",
                      borderBottom: "1.5px solid #e0e3e7",
                      background: "#fff",
                      borderRadius: 2,
                      boxShadow: "0 1px 4px rgba(66,165,245,0.03)",
                    }}
                  >
                    {typeof stats.max === "number" && !Number.isNaN(stats.max) ? `${stats.max.toFixed(1)}%` : "-"}
                  </TableCell>
                  <TableCell
                    sx={{
                      padding: "15px 14px",
                      fontSize: "1.07rem",
                      borderBottom: "1.5px solid #e0e3e7",
                      background: "#fff",
                      borderRadius: 2,
                      boxShadow: "0 1px 4px rgba(66,165,245,0.03)",
                    }}
                  >
                    {typeof stats.min === "number" && !Number.isNaN(stats.min) ? `${stats.min.toFixed(1)}%` : "-"}
                  </TableCell>
                  <TableCell
                    sx={{
                      padding: "15px 14px",
                      fontSize: "1.07rem",
                      borderBottom: "1.5px solid #e0e3e7",
                      background: "#fff",
                      borderRadius: 2,
                      boxShadow: "0 1px 4px rgba(66,165,245,0.03)",
                    }}
                  >
                    {typeof stats.median === "number" && !Number.isNaN(stats.median) ? `${stats.median.toFixed(1)}%` : "-"}
                  </TableCell>
                  <TableCell
                    sx={{
                      padding: "15px 14px",
                      fontSize: "1.07rem",
                      borderBottom: "1.5px solid #e0e3e7",
                      background: "#fff",
                      borderRadius: 2,
                      boxShadow: "0 1px 4px rgba(66,165,245,0.03)",
                    }}
                  >
                    {typeof stats.count === "number" && !Number.isNaN(stats.count) ? stats.count : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </div>
    </div>
  );
};

export default CourseScorePage;
