export default function itsDateString(dateInput: Date, includeDay = false) {
    const date = new Date(dateInput);
  
    if (isNaN(date.getTime())) {
      throw new Error("Invalid date input");
    }
  
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    
    // Get the abbreviated day name
    const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
  
    return includeDay ? `${dayName}, ${month}/${day}/${year}` : `${month}/${day}/${year}`;
  }
  