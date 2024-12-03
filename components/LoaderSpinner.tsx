import React from "react";

const LoaderSpinner = () => {
  return (
    <article className="flex justify-center items-center fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm zz-top-plus1 ">
      {" "}
      <div className="loader-spinner" />
    </article>
  );
};

export default LoaderSpinner;
