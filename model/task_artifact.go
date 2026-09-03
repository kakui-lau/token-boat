package model

import (
	"errors"

	"gorm.io/gorm"
)

// TaskArtifact stores generated binary output separately from Task so task
// list queries stay small even when an image response contains embedded data.
type TaskArtifact struct {
	ID          int64  `json:"id" gorm:"primaryKey"`
	CreatedAt   int64  `json:"created_at" gorm:"index"`
	TaskID      int64  `json:"task_id" gorm:"not null;uniqueIndex:idx_task_artifacts_task_position"`
	Position    int    `json:"position" gorm:"not null;uniqueIndex:idx_task_artifacts_task_position"`
	ContentType string `json:"content_type" gorm:"type:varchar(100);not null"`
	Content     []byte `json:"-" gorm:"not null"`
}

func (task *Task) InsertWithArtifacts(artifacts []TaskArtifact) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(task).Error; err != nil {
			return err
		}
		if len(artifacts) == 0 {
			return nil
		}
		for index := range artifacts {
			artifacts[index].TaskID = task.ID
		}
		return tx.Create(&artifacts).Error
	})
}

func GetUserTaskArtifact(userID int, taskID string, position int) (*TaskArtifact, bool, error) {
	if userID <= 0 || taskID == "" || position < 0 {
		return nil, false, nil
	}
	var artifact TaskArtifact
	err := DB.Table("task_artifacts").
		Select("task_artifacts.*").
		Joins("JOIN tasks ON tasks.id = task_artifacts.task_id").
		Where("tasks.user_id = ? AND tasks.task_id = ? AND task_artifacts.position = ?", userID, taskID, position).
		First(&artifact).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return &artifact, true, nil
}
