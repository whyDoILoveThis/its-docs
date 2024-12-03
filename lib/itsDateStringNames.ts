export default function itsDateStringNames(dateInput: Date) {
    const date = new Date(dateInput);
  
    if (isNaN(date.getTime())) {
      throw new Error("Invalid date input");
    }
  
    // Get abbreviated day name
    const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
  
    // Get abbreviated month name
    const monthName = date.toLocaleDateString("en-US", { month: "short" });
  
    // Get the day and year
    const day = date.getDate();
    const year = date.getFullYear();
  
    // Return the formatted string
    return `${dayName}, ${monthName} ${day} ${year}`;
  }
  