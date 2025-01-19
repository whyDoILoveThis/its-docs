import React, { useEffect, useState } from "react";
import AddDocItemForm from "./AddDocItemForm";
import { v4 } from "uuid";
import ItsCode from "@/components/ItsCode";
import ItsDropdown from "@/components/ItsDropdown";
import { useConfirm } from "@/components/ItsConfirmProvider";
import LoaderSpinSmall from "@/components/LoaderSpinSmall";
import docItemStyles from "./docItemStyles";
import axios from "axios";
import { useLocalDocItemsStore } from "@/hooks/useLocalDocItemsStore";
import EyeIcon from "@/components/icons/EyeIcon";
import TrashIcon from "@/components/icons/TrashIcon";
import { useAuth } from "@clerk/nextjs";

interface Props {
  doc: Doc;
  refetchProjectForDocs: () => void;
  projUid: string;
  theProject: Project;
}

const Doc = ({ doc, refetchProjectForDocs, projUid, theProject }: Props) => {
  const [formData, setFormData] = useState<DocItem>({
    uid: v4(),
    style: "",
    text: "",
  });
  const { userId } = useAuth();
  const [moveMode, setMoveMode] = useState(false); // Toggle move item mode
  const [editMode, setEditMode] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const { localDocItems, setLocalDocItems } = useLocalDocItemsStore();
  const [loading, setLoading] = useState(false);
  const { ItsConfirm } = useConfirm();
  const [selectedDocIndex, setSelectedDocIndex] = useState(-999);
  const [editDocItemIndex, setEditDocItemIndex] = useState(-999);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [codeLang, setCodeLang] = useState("tsx");
  const [tempItemText, setTempItemText] = useState<(string | null)[]>([]);
  const [tempItemStyles, setTempItemStyles] = useState<(string | null)[]>([]);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [showTheUnsavedChanges, setShowTheUnsavedChanges] = useState(false);
  const [unsavedItemUids, setUnsavedItemUids] = useState<(string | null)[]>([]);
  const [localDoc, setLocalDoc] = useState<Doc>(doc);

  useEffect(() => {
    doc.docItems && setLocalDocItems(doc.docItems);
    console.log("setLocalDocItems");
  }, [doc.docItems, setLocalDocItems]);

  if (!localDocItems) return;

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

  const setItemStyle = (index: number, newStyle: string, uid: string) => {
    // Create a copy of the array
    const modifiedItemUids = [...unsavedItemUids];

    // Update the specific index
    modifiedItemUids[index] = uid;

    // Update the state
    setUnsavedItemUids(modifiedItemUids);

    // Create a copy of the array
    const updatedStrings = [...tempItemStyles];

    // Update the specific index
    updatedStrings[index] = newStyle;

    // Update the state
    setTempItemStyles(updatedStrings);

    const updatedItems = [...localDocItems];

    // Update the style of the specified item
    updatedItems[index].style = newStyle;

    // Update state
    setLocalDocItems(updatedItems);
  };

  const setItemText = (index: number, newText: string | null) => {
    // Create a copy of the array
    const updatedStrings = [...tempItemText];

    // Update the specific index
    updatedStrings[index] = newText;

    // Update the state
    setTempItemText(updatedStrings);
  };

  console.log(localDocItems, tempItemText);

  const updateDocument = async (
    projUid: string,
    docId: string,
    updatedDoc: Doc
  ) => {
    try {
      const response = await axios.put("/api/updateDoc", {
        projUid,
        docId,
        updatedDoc,
      });

      console.log("✅ Document updated successfully:", response.data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("❌ Axios error:", error.response?.data || error.message);
      } else {
        console.error("❌ Unexpected error:", error);
      }
      throw error;
    }
  };

  // Save updated items to the database
  const saveUpdatedDocItems = async () => {
    const theItems = localDocItems;
    // Merge tempItemText into localDocItems
    const updatedDocItems = theItems.map((item, index) => {
      return {
        ...item, // Preserve other properties of the item
        text: tempItemText[index] ? tempItemText[index] : item.text, // Update text only if tempItemText[index] exists
      };
    });

    try {
      setLoading(true);

      await updateDocument(projUid, doc.uid, localDoc);

      const response = await fetch("/api/updateDocItems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projUid,
          docUid: doc.uid,
          docItems: updatedDocItems, // Use the merged array
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
        setTempItemText([]);
      }
      if (editMode) {
        setEditMode(false);
        setTempItemText([]);
        setLocalDoc(doc);
        if (tempItemStyles.length > 0) {
          setUnsavedChanges(true);
        }
      }

      doc.docItems && setLocalDocItems(doc.docItems);
    }
  };

  const handleToggleAddMode = (on: boolean) => {
    if (on) {
      setAddMode(true);
    } else if (!on) {
      setAddMode(false);
    }
  };

  if (loadingDelete) {
    return (
      <div className="fixed inset-0 zz-top-minus1 backdrop-blur-md pt-16 flex justify-center">
        <LoaderSpinSmall />
      </div>
    );
  }

  return (
    <div className="mb-24 flex flex-col items-center gap-2 w-full">
      {/** Cover for back btn on ProjectPage */}
      {(tempItemStyles.length > 0 || editMode) && (
        <div className="w-[45px] rounded-sm overflow-hidden bg-black bg-opacity-20 h-[25px] backdrop-blur-sm fixed place-self-start" />
      )}{" "}
      {tempItemStyles.length > 0 &&
        unsavedChanges &&
        !editMode &&
        !moveMode && (
          <div className="fixed flex flex-col justify-center bottom-24 left-{50%} btn btn-nohover btn-red backdrop-blur-lg !bg-opacity-45">
            {/** Unsaved changes pop */}
            <div
              className={`flex items-center ${
                showTheUnsavedChanges ? "flex-col gap-1" : "justify-between"
              }`}
            >
              <div className="flex flex-col items-center">
                <p className="text-xl font-bold">UNSAVED STYLES</p>
                <button
                  onClick={() => {
                    setShowTheUnsavedChanges(!showTheUnsavedChanges);
                  }}
                  className="btn btn-xs !p-1 !py-0 !text-[14px] btn-squish"
                >
                  {showTheUnsavedChanges ? (
                    <p className="text-xs">Hide</p>
                  ) : (
                    <EyeIcon />
                  )}
                </button>
                {showTheUnsavedChanges && (
                  <div>
                    {unsavedItemUids.map((itemUid, index) => {
                      const item = localDocItems.find((i) => i.uid === itemUid);

                      if (!item) return null;

                      return (
                        <div
                          key={index}
                          className="flex flex-col items-center border p-2 rounded-md mt-1.5"
                        >
                          {item.style !== "code" &&
                          editDocItemIndex !== index ? (
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
                              <p>
                                {tempItemText[index]
                                  ? tempItemText[index]
                                  : item.text}
                              </p>
                            </div>
                          ) : (
                            editDocItemIndex !== index &&
                            item.style === "code" && (
                              <span
                                className={` ${
                                  editMode
                                    ? "!cursor-pointer"
                                    : "!cursor-default"
                                }`}
                                onClick={() => {
                                  setSelectedDocIndex(index);
                                  setEditDocItemIndex(-999);
                                }}
                              >
                                <ItsCode
                                  code={
                                    tempItemText[index]
                                      ? tempItemText[index]
                                      : item.text
                                  }
                                  lang={"tsx"}
                                />
                              </span>
                            )
                          )}{" "}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                className="btn btn-green backdrop-blur-md "
                onClick={saveUpdatedDocItems}
                disabled={loading}
              >
                {loading ? <LoaderSpinSmall /> : "Save Changes"}
              </button>
            </div>
            <p className="mt-2 text-center">
              These changes will be gone when you refresh or close this page!!!
            </p>
          </div>
        )}
      {/** SETTINGS BTN */}
      {userId && userId === theProject.creatorUid && (
        <div className="w-fit fixed place-self-end">
          <ItsDropdown
            closeWhenClicked={true}
            btnText="Settings"
            btnClassNames=" btn btn-outline btn-xs btn-squish text-shadow flex gap-1 items-center backdrop-blur-md"
            menuClassNames="-translate-x-24"
          >
            <h3 className="w-full font-bold">Modes</h3>
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
              {editMode ? "Exit Edit" : "Edit"}
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
              {moveMode ? "Exit Move" : "Move"}
            </li>
            <li
              onClick={() => handleToggleAddMode(true)}
              className={`btn btn-ghost text-nowrap ${
                (editMode && "blur-sm") || (moveMode && "blur-sm")
              }`}
              style={{ width: "100%" }}
            >
              Add
            </li>
            <li
              onClick={() => handleToggleAddMode(false)}
              className={`btn btn-ghost text-nowrap ${
                (editMode && "blur-sm") || (moveMode && "blur-sm")
              }`}
              style={{ width: "100%" }}
            >
              Read Only
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
      )}
      {/** HEAADING */}
      <span className="flex flex-col gap-2">
        <h1 className="font-bold mt-6">
          {localDoc.title || (localDoc.title !== "" && doc.title)}
        </h1>
        {editMode && (
          <input
            defaultValue={doc.title}
            onChange={(e) => {
              setLocalDoc({ ...localDoc, title: e.target.value });
            }}
            type="text"
            className="input"
          />
        )}
      </span>
      <span className="flex flex-col gap-2">
        <p className={`${!editMode && "mb-4"}`}>
          {localDoc.tagline || (localDoc.tagline !== "" && doc.tagline)}
        </p>
        {editMode && (
          <input
            defaultValue={doc.tagline}
            onChange={(e) => {
              setLocalDoc({ ...localDoc, tagline: e.target.value });
            }}
            type="text"
            className="input"
          />
        )}
      </span>
      <span className="flex flex-col gap-2 max-w-[400px]">
        <p>{localDoc.desc || (localDoc.desc !== "" && doc.desc && doc.desc)}</p>
        {editMode && (
          <textarea
            defaultValue={doc.desc}
            onChange={(e) => {
              setLocalDoc({ ...localDoc, desc: e.target.value });
            }}
            className="input min-h-[130px]"
          />
        )}
      </span>
      {/** SAVE BTN */}
      {moveMode && (
        <button
          className="btn btn-green fixed bottom-2 backdrop-blur-md z-10 place-self-end"
          onClick={saveUpdatedDocItems}
          disabled={loading}
        >
          {loading ? <LoaderSpinSmall /> : "Save Changes"}
        </button>
      )}
      {(editMode || doc !== localDoc) && (
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
                  <p>{tempItemText[index] ? tempItemText[index] : item.text}</p>
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
                  <ItsCode
                    code={tempItemText[index] ? tempItemText[index] : item.text}
                    lang={"tsx"}
                  />
                </span>
              ) : item.style === "code" && editDocItemIndex === index ? (
                <span>
                  <ItsCode
                    code={tempItemText[index] ? tempItemText[index] : item.text}
                    lang={codeLang}
                  />
                  <textarea
                    className="input w-full"
                    defaultValue={tempItemText[index] || item.text}
                    autoFocus
                    onChange={(e) => {
                      setItemText(index, e.target.value);
                    }}
                  />
                </span>
              ) : (
                item.style !== "code" &&
                editDocItemIndex === index && (
                  <input
                    type="text"
                    defaultValue={tempItemText[index] || item.text}
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
                <div className="flex justify-between rounded-t-none pt-4 -translate-y-1 border-t-0 gap-2 p-2 w-full border rounded-lg">
                  <div className="flex items-center gap-1">
                    <h2 className="w-full font-bold">Edit</h2>
                    <button
                      onClick={() => {
                        const updatedItems = [...localDocItems];
                        updatedItems.splice(index, 1); // Remove the item at the current index
                        setLocalDocItems(updatedItems);
                      }}
                      className="btn btn-round btn-ghost btn-red"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button
                      className="btn btn-ghost text-nowrap"
                      onClick={() => {
                        if (editDocItemIndex !== index) {
                          setEditDocItemIndex(index);
                        } else {
                          setEditDocItemIndex(-999);
                          setItemText(index, null);
                        }
                      }}
                    >
                      {editDocItemIndex !== index ? "Text" : "cancel"}
                    </button>
                    <ItsDropdown
                      closeWhenClicked={true}
                      btnText="Style"
                      btnClassNames="btn btn-ghost "
                      menuClassNames="-translate-x-16"
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
                              setItemStyle(index, style.color, item.uid);
                            }}
                          >
                            {style.text}
                          </li>
                        ))}
                      </div>
                    </ItsDropdown>
                    {/** Language Selection */}
                    {item.style === "code" && (
                      <ItsDropdown
                        btnText="Lang"
                        btnClassNames="btn btn-ghost "
                        menuClassNames="-translate-x-44"
                      >
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
                </div>
              )}
            </div>
          </div>
        ))}
      {((!moveMode && !editMode && addMode) ||
        (doc.docItems &&
          doc.docItems?.length <= 0 &&
          !editMode &&
          !moveMode)) && (
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
