import { useEffect, useRef, useState } from "react";
import CalendarIcon from "./icons/CalendarIcon";

interface DatePickerProps {
  useMonthNames?: boolean; // Prop for using month names
  onDateChange?: (date: Date) => void; // Callback to pass the date back to the parent
}

export default function CustomDatePicker({
  useMonthNames = false,
  onDateChange,
}: DatePickerProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Month options
  const monthOptions = useMonthNames
    ? [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ]
    : [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];

  // Get number of days in the month
  const getDaysInMonth = (month: number, year: number) =>
    new Date(year, month + 1, 0).getDate();

  // Handle date selection
  const handleDateSelect = (day: number) => {
    const newDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      day
    );
    setSelectedDate(newDate);
    onDateChange?.(newDate); // Pass the date back to the parent
    setIsOpen(false);
  };

  // Generate days grid with proper indentation
  const generateDaysGrid = () => {
    const daysInMonth = getDaysInMonth(
      selectedDate.getMonth(),
      selectedDate.getFullYear()
    );
    const firstDayOfMonth = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      1
    ).getDay();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const paddedDays = [
      ...Array(firstDayOfMonth).fill(null), // Empty spaces for indentation
      ...days,
    ];

    return paddedDays;
  };

  // Close dropdown if clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    // Add event listener
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      // Clean up listener on unmount
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      {/* Input Field */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-[227px] flex items-center gap-1 p-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
      >
        <CalendarIcon />
        {selectedDate.toDateString()}
      </div>

      {/* Date Picker Dropdown */}
      {isOpen && (
        <div className="absolute z-10 mt-2 p-4 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-transparent shadow-md w-64 backdrop-blur-md">
          {/* Month and Year Selectors */}
          <div className="flex justify-between gap-2 mb-4">
            <select
              className="cursor-pointer w-1/2 p-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-zinc-800 text-slate-900 dark:text-slate-100"
              value={selectedDate.getMonth()}
              onChange={(e) =>
                setSelectedDate(
                  new Date(
                    selectedDate.getFullYear(),
                    parseInt(e.target.value),
                    selectedDate.getDate()
                  )
                )
              }
            >
              {monthOptions.map((month, index) => (
                <option key={month} value={index}>
                  {month}
                </option>
              ))}
            </select>

            <select
              className="cursor-pointer w-1/2 p-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-zinc-800 text-slate-900 dark:text-slate-100"
              value={selectedDate.getFullYear()}
              onChange={(e) =>
                setSelectedDate(
                  new Date(
                    parseInt(e.target.value),
                    selectedDate.getMonth(),
                    selectedDate.getDate()
                  )
                )
              }
            >
              {Array.from(
                { length: 101 },
                (_, i) => new Date().getFullYear() - i
              ).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Days of Week */}
          <div className="grid grid-cols-7 mb-2 text-center text-slate-900 dark:text-slate-100">
            {daysOfWeek.map((day) => (
              <p key={day} className="p-1 text-xs">
                {day}
              </p>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {generateDaysGrid().map((day, index) => (
              <button
                key={index}
                onClick={() => day && handleDateSelect(day)}
                disabled={!day}
                className={`w-8 h-8 p-1 rounded-md ${
                  day
                    ? "hover:bg-black hover:bg-opacity-10 dark:hover:bg-white dark:hover:bg-opacity-10 transition-colors text-slate-900 dark:text-slate-100"
                    : "cursor-default"
                }`}
              >
                {day || ""}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
