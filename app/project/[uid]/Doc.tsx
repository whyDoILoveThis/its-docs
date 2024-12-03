import React, { useEffect, useState } from "react";
import AddDocItemForm from "./AddDocItemForm";
import { v4 } from "uuid";
import ItsCode from "@/components/ItsCode";
import ItsDropdown from "@/components/ItsDropdown";
import { useConfirm } from "@/components/ItsConfirmProvider";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import docItemStyles from "./docItemStyles";
import axios from "axios";

interface Props {
  doc: Doc;
  refetchProjectForDocs: () => void;
  projUid: string;
}

const Doc = ({ doc, refetchProjectForDocs, projUid }: Props) => {
  const [formData, setFormData] = useState<DocItem>({
    uid: v4(),
    style: "",
    text: "",
  });
  const [moveMode, setMoveMode] = useState(false); // Toggle move item mode
  const [editMode, setEditMode] = useState(false);
  const [localDocItems, setLocalDocItems] = useState<DocItem[]>([
    { style: "", text: "", uid: "" },
  ]); // Local copy for manipulation
  const [loading, setLoading] = useState(false);
  const { ItsConfirm } = useConfirm();
  const [selectedDocIndex, setSelectedDocIndex] = useState(-999);
  const [editDocItemIndex, setEditDocItemIndex] = useState(-999);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [codeLang, setCodeLang] = useState("tsx");
  const [tempItemText, setTempItemText] = useState("");
  const safeCopyOfItems = doc.docItems;

  useEffect(() => {
    setLocalDocItems(doc.docItems);
  }, [doc.docItems]);

  // Move item up locally
  const moveItemUp = (index: number) => {
    if (index === 0) return; // Can't move the first item up
    const updatedItems = [...localDocItems];
    [updatedItems[index - 1], updatedItems[index]] = [
      updatedItems[index],
      updatedItems[index - 1],
    ];
    setLocalDocItems(updatedItems);
  };

  // Move item down locally
  const moveItemDown = (index: number) => {
    if (index === localDocItems.length - 1) return; // Can't move the last item down
    const updatedItems = [...localDocItems];
    [updatedItems[index], updatedItems[index + 1]] = [
      updatedItems[index + 1],
      updatedItems[index],
    ];
    setLocalDocItems(updatedItems);
  };

  const setItemStyle = (index: number, newStyle: string) => {
    const updatedItems = [...localDocItems];

    // Update the style of the specified item
    updatedItems[index].style = newStyle;

    // Update state
    setLocalDocItems(updatedItems);
  };

  const setItemText = (index: number, newText: string) => {
    const updatedItems = [...localDocItems];

    // Update the style of the specified item
    updatedItems[index].text = newText;

    // Update state
    setLocalDocItems(updatedItems);
  };

  // Save updated items to the database
  const saveUpdatedDocItems = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/updateDocItems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projUid,
          docUid: doc.uid,
          docItems: localDocItems,
        }),
      });
      console.log(response);

      refetchProjectForDocs();
      setLoading(false);
    } catch (error) {
      console.error("❌ An error occurred:", error);
      setLoading(false);
    }
  };

  // Add new doc item
  const handleAddDocItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/addDocItem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projUid, docUid: doc.uid, docItem: formData }),
      });
      console.log(response);

      refetchProjectForDocs();
    } catch (error) {
      console.error("❌ An error occurred:", error);
    }
  };

  const handleDeleteDoc = async () => {
    const confirmed = await ItsConfirm(
      `You are about to DELETE ${doc.title}!! Are you sure??`
    );
    if (confirmed) {
      const confirmedAgain = await ItsConfirm(
        `${doc.title} WILL BE GONE FOREVER ARE YOU SURE?!?!`
      );
      if (confirmedAgain) {
        setLoadingDelete(true);
        try {
          const response = await axios.delete("/api/deleteDoc", {
            data: {
              projUid,
              docId: doc.uid,
            },
          });

          if (response.status === 200) {
            console.log("✅ Doc deleted successfully:", response.data.message);
            // Optionally update your UI or state here
          }
          refetchProjectForDocs();
          setLoading(false);
        } catch (error) {
          console.error("❌ An unexpected error occurred:", error);
        }
      }
    }
  };

  const handleExitMode = async () => {
    const confirmed = await ItsConfirm(
      `Are you sure you want to Exit? Changes will NOT be saved!`
    );

    if (confirmed) {
      if (moveMode) {
        setMoveMode(false);
        setLocalDocItems(safeCopyOfItems);
      }
      if (editMode) {
        setLocalDocItems(safeCopyOfItems);
      }

      setTimeout(() => {
        setLocalDocItems(safeCopyOfItems);
      }, 500);
    }
  };

  console.log(doc.docItems[0].text);

  if (loadingDelete) {
    return (
      <div className="fixed inset-0 zz-top-minus1 backdrop-blur-md pt-16 flex justify-center">
        <LoaderSpinSmall />
      </div>
    );
  }

  return (
    <div className="mb-24 flex flex-col items-center gap-2 w-full">
      {/** SETTINGS BTN */}
      <div className="w-fit fixed place-self-end">
        <ItsDropdown
          closeWhenClicked={true}
          btnText="Settings"
          btnClassNames=" btn btn-outline btn-xs btn-squish text-shadow flex gap-1 items-center backdrop-blur-md"
          menuClassNames="-translate-x-24"
        >
          <li
            onClick={() => {
              if (editMode) {
                handleExitMode();
              } else if (!moveMode) {
                setEditMode(true);
              }
            }}
            className={`btn btn-ghost text-nowrap ${moveMode && "blur-sm"}`}
            style={{ width: "100%" }}
          >
            {editMode ? "Exit Edit Mode" : "Edit Mode"}
          </li>
          <li
            onClick={() => {
              if (moveMode) {
                handleExitMode();
              } else if (!editMode) {
                setMoveMode(true);
              }
            }}
            className={`btn btn-ghost text-nowrap ${editMode && "blur-sm"}`}
            style={{ width: "100%" }}
          >
            {moveMode ? "Exit Move Mode" : "Move Mode"}
          </li>
          <li
            onClick={() => handleDeleteDoc()}
            className={`btn btn-ghost btn-red ${
              (editMode && "blur-sm") || (moveMode && "blur-sm")
            }`}
            style={{ width: "100%" }}
          >
            Delete
          </li>
        </ItsDropdown>
      </div>

      {/** HEAADING */}
      <h1 className="font-bold">{doc.title}</h1>
      <p className="mb-4">{doc.tagline && doc.tagline}</p>
      <p>{doc.desc && doc.desc}</p>

      {/** SAVE BTN */}
      {moveMode && (
        <button
          className="btn btn-green fixed bottom-2 backdrop-blur-md place-self-end"
          onClick={saveUpdatedDocItems}
          disabled={loading}
        >
          {loading ? <LoaderSpinSmall /> : "Save Changes"}
        </button>
      )}
      {editMode && (
        <button
          className="btn btn-green fixed bottom-2 backdrop-blur-md place-self-end"
          onClick={saveUpdatedDocItems}
          disabled={loading}
        >
          {loading ? <LoaderSpinSmall /> : "Save Changes"}
        </button>
      )}

      {/**  DOC ITEMS */}
      {localDocItems &&
        localDocItems.map((item: DocItem, index) => (
          <div className={`mb-4 w-full max-w-[500px] `} key={index}>
            <div className="flex flex-col items-center">
              {item.style !== "code" && editDocItemIndex !== index ? (
                <div
                  onClick={() => {
                    setSelectedDocIndex(index);
                    setEditDocItemIndex(-999);
                  }}
                  className={`btn btn-nohover ${
                    item.style !== "code" && item.style
                  } ${
                    item.style === "text-xl font-bold " &&
                    "!border-none !bg-transparent text-center leading-none mt-6"
                  } ${
                    editMode ? "!cursor-pointer" : "!cursor-default"
                  } !w-full !max-w-[500px]`}
                >
                  <p>{tempItemText !== "" ? tempItemText : item.text}</p>
                </div>
              ) : editDocItemIndex !== index && item.style === "code" ? (
                <span
                  className={` ${
                    editMode ? "!cursor-pointer" : "!cursor-default"
                  }`}
                  onClick={() => {
                    setSelectedDocIndex(index);
                    setEditDocItemIndex(-999);
                  }}
                >
                  <ItsCode code={item.text} lang={"tsx"} />
                </span>
              ) : item.style === "code" && editDocItemIndex === index ? (
                <span>
                  <ItsCode
                    code={tempItemText !== "" ? tempItemText : item.text}
                    lang={codeLang}
                  />
                  <textarea
                    className="input"
                    defaultValue={item.text}
                    autoFocus
                    onChange={(e) => {
                      setTempItemText(e.target.value);
                    }}
                  />
                </span>
              ) : (
                item.style !== "code" &&
                editDocItemIndex === index && (
                  <input
                    type="text"
                    defaultValue={item.text}
                    autoFocus
                    onChange={(e) => {
                      setItemText(index, e.target.value);
                    }}
                    className={`btn btn-nohover focus:outline-none focus:ring-2 focus:ring-slate-300 dark:focus:ring-2 dark:focus:ring-slate-700 ${
                      item.style !== "code" && item.style
                    } ${
                      item.style === "text-xl font-bold " &&
                      "!border-none !bg-transparent text-center leading-none mt-6"
                    } ${
                      editMode ? "!cursor-pointer" : "!cursor-default"
                    } !w-full !max-w-[500px]`}
                  />
                )
              )}
              {item.style === "text-xl font-bold " && (
                <div className="flex items-center w-full">
                  <div className="w-3 h-3 bg-white rounded-sm" />
                  <div className="h-[2px] w-full bg-white" />
                  <div className="w-3 h-3 bg-white rounded-sm" />
                </div>
              )}
              {/* Move item arrows */}
              {moveMode && (
                <div className="flex rounded-t-none pt-4 -translate-y-1 border-t-0 gap-2 p-2 w-full border rounded-lg">
                  <button
                    className="btn btn-round btn-ghost"
                    onClick={() => moveItemUp(index)}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    className="btn btn-round btn-ghost"
                    onClick={() => moveItemDown(index)}
                    disabled={index === localDocItems.length - 1}
                  >
                    ↓
                  </button>
                </div>
              )}
              {/* Edit item options */}
              {editMode && selectedDocIndex === index && (
                <div className="flex rounded-t-none pt-4 -translate-y-1 border-t-0 gap-2 p-2 w-full border rounded-lg">
                  <h2 className="w-full font-bold">Edit</h2>
                  <button
                    className="btn btn-ghost text-nowrap"
                    onClick={() => {
                      if (editDocItemIndex !== index) {
                        setEditDocItemIndex(index);
                      } else {
                        setEditDocItemIndex(-999);
                        setTempItemText("");
                      }
                    }}
                  >
                    {editDocItemIndex !== index ? "Text" : "cancel"}
                  </button>
                  <ItsDropdown
                    closeWhenClicked={true}
                    btnText="Style"
                    btnClassNames="btn btn-ghost "
                  >
                    <div className="flex flex-col gap-2">
                      {docItemStyles.map((style, index2) => (
                        <li
                          key={index2}
                          className={` btn btn-xs btn-squish ${
                            style.text !== "Section" &&
                            style.text !== "Code" &&
                            style.color
                          }  ${
                            style.text === "Code" &&
                            "!border-purple-500 !text-purple-200"
                          } !border-opacity-75 backdrop-blur-md`}
                          style={{ width: "100%" }}
                          onClick={() => {
                            setItemStyle(index, style.color);
                          }}
                        >
                          {style.text}
                        </li>
                      ))}
                    </div>
                  </ItsDropdown>
                  {item.style === "code" && (
                    <ItsDropdown btnText="Lang" btnClassNames="btn btn-ghost ">
                      <div className="flex flex-col gap-2">
                        <li style={{ width: "100%" }}>
                          <input
                            type="text"
                            className="input"
                            value={codeLang}
                            onChange={(e) => {
                              setCodeLang(e.target.value);
                            }}
                          />
                        </li>
                      </div>
                    </ItsDropdown>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      {!moveMode && !editMode && (
        <AddDocItemForm
          formData={formData}
          setFormData={setFormData}
          handleAddDocItem={handleAddDocItem}
        />
      )}
    </div>
  );
};

export default Doc;
